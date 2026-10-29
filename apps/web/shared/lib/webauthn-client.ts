export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return true;
  }
}

export function getDefaultDeviceName(): string {
  if (typeof navigator === "undefined") return "Mobile Device";
  const ua = navigator.userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone (Touch ID / Face ID)";
  if (/iPad/i.test(ua)) return "iPad (Touch ID / Face ID)";
  if (/Android/i.test(ua)) return "Android (Otisk prstu)";
  if (/Mac/i.test(ua)) return "Mac (Touch ID)";
  if (/Windows/i.test(ua)) return "Windows Hello";
  return "Biometric Passkey";
}

export async function createWebAuthnPasskey(challengeBase64Url: string, deviceName: string) {
  const challengeBytes = base64UrlToUint8Array(challengeBase64Url);
  const userIdBytes = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(userIdBytes);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challengeBytes,
      rp: {
        name: "AI Vault",
        id: window.location.hostname,
      },
      user: {
        id: userIdBytes,
        name: "vault-owner",
        displayName: deviceName || "AI Vault Owner",
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256
        { alg: -257, type: "public-key" }, // RS256
        { alg: -8, type: "public-key" },   // EdDSA
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Biometric registration was cancelled.");
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const spkiBuffer = response.getPublicKey();
  if (!spkiBuffer) {
    throw new Error("Browser did not return SPKI public key for passkey.");
  }

  const algorithm =
    typeof response.getPublicKeyAlgorithm === "function"
      ? response.getPublicKeyAlgorithm()
      : -7;

  return {
    credentialId: bufferToBase64Url(credential.rawId),
    publicKeySpki: bufferToBase64Url(spkiBuffer),
    algorithm,
    clientDataJSON: bufferToBase64Url(response.clientDataJSON),
  };
}

export async function authenticateWebAuthnPasskey(
  challengeBase64Url: string,
  credentialIds?: string[]
) {
  const challengeBytes = base64UrlToUint8Array(challengeBase64Url);

  const allowCredentials: PublicKeyCredentialDescriptor[] | undefined =
    credentialIds && credentialIds.length > 0
      ? credentialIds.map((id) => ({
          id: base64UrlToUint8Array(id),
          type: "public-key",
        }))
      : undefined;

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes,
      rpId: window.location.hostname,
      allowCredentials,
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Biometric authentication was cancelled.");
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    credentialId: bufferToBase64Url(credential.rawId),
    authenticatorData: bufferToBase64Url(response.authenticatorData),
    clientDataJSON: bufferToBase64Url(response.clientDataJSON),
    signature: bufferToBase64Url(response.signature),
  };
}

