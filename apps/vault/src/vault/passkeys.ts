import crypto from "node:crypto";
import { config } from "../config.js";
import {
  createPasskeyRecord,
  listPasskeyRecords,
  findPasskeyByCredentialId,
  updatePasskeyLastUsed,
  deletePasskeyById,
} from "../db/repository/passkeys.repository.js";
import {
  deriveSubKey,
  encryptBuffer,
  decryptBuffer,
  generateRandomSalt,
  HKDF_INFO_PASSKEY,
  AAD_WRAPPED_VAULT_KEY_PASSKEY,
} from "./crypto.js";
import { vaultState } from "./state.js";
import { InvalidCredentialsError } from "./unlock.js";
import {
  PasskeyDto,
  PasskeyChallengeResponse,
  RegisterPasskeyRequest,
  VerifyPasskeyUnlockRequest,
  VaultUnlockResponse,
} from "@ai-vault/types";

export class PasskeyNotFoundError extends Error {
  constructor(message = "Passkey not found.") {
    super(message);
    this.name = "PasskeyNotFoundError";
  }
}

const CHALLENGE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const activeChallenges = new Map<string, number>();

function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [challenge, expiresAt] of activeChallenges.entries()) {
    if (now > expiresAt) {
      activeChallenges.delete(challenge);
    }
  }
}

export function issueChallenge(): string {
  cleanupExpiredChallenges();
  const challenge = crypto.randomBytes(32).toString("base64url");
  activeChallenges.set(challenge, Date.now() + CHALLENGE_TTL_MS);
  return challenge;
}

export function consumeChallenge(challenge: string): boolean {
  cleanupExpiredChallenges();
  const expiresAt = activeChallenges.get(challenge);
  if (!expiresAt) return false;
  activeChallenges.delete(challenge);
  return Date.now() <= expiresAt;
}

function derivePasskeyWrappingKey(credentialId: string, saltHex: string): Buffer {
  const masterMaterial = Buffer.from(`${config.ipcSecret}:${credentialId}`, "utf-8");
  const salt = Buffer.from(saltHex, "hex");
  try {
    return deriveSubKey(masterMaterial, HKDF_INFO_PASSKEY, salt, 32);
  } finally {
    masterMaterial.fill(0);
  }
}

export async function createPasskeyChallenge(includeCredentials = false): Promise<PasskeyChallengeResponse> {
  const challenge = issueChallenge();
  if (!includeCredentials) {
    return { success: true, challenge };
  }

  const records = await listPasskeyRecords();
  return {
    success: true,
    challenge,
    credentialIds: records.map((r) => r.credential_id),
  };
}

export async function listPasskeys(): Promise<PasskeyDto[]> {
  const records = await listPasskeyRecords();
  return records.map((r) => ({
    id: r.id,
    credentialId: r.credential_id,
    name: r.name,
    createdAt: r.created_at.toISOString(),
    lastUsedAt: r.last_used_at ? r.last_used_at.toISOString() : null,
  }));
}

export async function removePasskey(id: string): Promise<void> {
  const deleted = await deletePasskeyById(id);
  if (!deleted) {
    throw new PasskeyNotFoundError();
  }
}

export async function registerPasskey(
  req: RegisterPasskeyRequest,
  sessionToken: string
): Promise<PasskeyDto> {
  // 1. Parse and verify clientDataJSON challenge
  let clientData: { type?: string; challenge?: string };
  try {
    const rawJson = Buffer.from(req.clientDataJSON, "base64url").toString("utf-8");
    clientData = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid WebAuthn clientDataJSON.");
  }

  if (clientData.type !== "webauthn.create") {
    throw new Error("Invalid WebAuthn ceremony type.");
  }

  if (!clientData.challenge || !consumeChallenge(clientData.challenge)) {
    throw new Error("Invalid or expired WebAuthn challenge.");
  }

  // 2. Validate SPKI public key format
  try {
    const spkiBuf = Buffer.from(req.publicKeySpki, "base64url");
    crypto.createPublicKey({ key: spkiBuf, format: "der", type: "spki" });
  } catch {
    throw new Error("Invalid WebAuthn SPKI public key.");
  }

  // 3. Encrypt the vault master key for this passkey
  return vaultState.withVaultKey(sessionToken, async (vaultKey) => {
    const kdfSalt = generateRandomSalt(32);
    const wrappingKey = derivePasskeyWrappingKey(req.credentialId, kdfSalt);

    let wrapped: { ciphertext: string; iv: string; tag: string };
    try {
      wrapped = encryptBuffer(vaultKey, wrappingKey, AAD_WRAPPED_VAULT_KEY_PASSKEY);
    } finally {
      wrappingKey.fill(0);
    }

    const saved = await createPasskeyRecord({
      credential_id: req.credentialId,
      name: req.name.trim() || "Biometric Passkey",
      public_key_spki: req.publicKeySpki,
      algorithm: req.algorithm || -7,
      kdf_salt: kdfSalt,
      wrapped_vault_key: wrapped.ciphertext,
      wrapped_vault_key_iv: wrapped.iv,
      wrapped_vault_key_tag: wrapped.tag,
    });

    return {
      id: saved.id,
      credentialId: saved.credential_id,
      name: saved.name,
      createdAt: saved.created_at.toISOString(),
      lastUsedAt: saved.last_used_at ? saved.last_used_at.toISOString() : null,
    };
  });
}

export async function verifyPasskeyAndUnlock(
  req: VerifyPasskeyUnlockRequest
): Promise<VaultUnlockResponse> {
  const record = await findPasskeyByCredentialId(req.credentialId);
  if (!record) {
    throw new InvalidCredentialsError("Passkey is not registered.");
  }

  // 1. Parse and verify clientDataJSON
  let clientDataBuf: Buffer;
  let clientData: { type?: string; challenge?: string };
  try {
    clientDataBuf = Buffer.from(req.clientDataJSON, "base64url");
    clientData = JSON.parse(clientDataBuf.toString("utf-8"));
  } catch {
    throw new InvalidCredentialsError("Invalid WebAuthn clientDataJSON.");
  }

  if (clientData.type !== "webauthn.get") {
    throw new InvalidCredentialsError("Invalid WebAuthn ceremony type.");
  }

  if (!clientData.challenge || !consumeChallenge(clientData.challenge)) {
    throw new InvalidCredentialsError("WebAuthn challenge expired or invalid.");
  }

  // 2. Verify authenticatorData flags (User Present + User Verified)
  const authDataBuf = Buffer.from(req.authenticatorData, "base64url");
  if (authDataBuf.length < 37) {
    throw new InvalidCredentialsError("Invalid authenticatorData length.");
  }

  const flags = authDataBuf[32];
  const isUserPresent = (flags & 0x01) !== 0;
  const isUserVerified = (flags & 0x04) !== 0;
  if (!isUserPresent || !isUserVerified) {
    throw new InvalidCredentialsError("Biometric user verification required.");
  }

  // 3. Verify cryptographic assertion signature
  const clientDataHash = crypto.createHash("sha256").update(clientDataBuf).digest();
  const signedData = Buffer.concat([authDataBuf, clientDataHash]);
  const signatureBuf = Buffer.from(req.signature, "base64url");

  let isValidSignature = false;
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(record.public_key_spki, "base64url"),
      format: "der",
      type: "spki",
    });

    const verifyAlg = record.algorithm === -8 ? null : "sha256";
    isValidSignature = crypto.verify(verifyAlg, signedData, publicKey, signatureBuf);
  } catch {
    isValidSignature = false;
  }

  if (!isValidSignature) {
    throw new InvalidCredentialsError("Invalid biometric signature.");
  }

  // 4. Unwrap Vault Master Key and create session
  const wrappingKey = derivePasskeyWrappingKey(record.credential_id, record.kdf_salt);
  let vaultKey: Buffer | null = null;
  try {
    vaultKey = decryptBuffer(
      {
        ciphertext: record.wrapped_vault_key,
        iv: record.wrapped_vault_key_iv,
        tag: record.wrapped_vault_key_tag,
      },
      wrappingKey,
      AAD_WRAPPED_VAULT_KEY_PASSKEY
    );

    const sessionToken = vaultState.createSession(vaultKey);
    await updatePasskeyLastUsed(record.id).catch(() => {});

    return {
      success: true,
      sessionToken,
    };
  } catch {
    throw new InvalidCredentialsError("Failed to unwrap vault key with passkey.");
  } finally {
    wrappingKey.fill(0);
    if (vaultKey) {
      vaultKey.fill(0);
    }
  }
}

