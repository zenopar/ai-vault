import { randomUUID } from "node:crypto";
import { vaultState } from "../state.js";
import { encryptBuffer, decryptBuffer } from "../crypto.js";
import { buildFieldAad } from "../keys.js";
import { encryptFilePayload, decryptFilePayload } from "./file-crypto.js";
import { uploadToR2, downloadFromR2 } from "./r2-client.js";
import {
  createFileRecord,
  getFileRecordById,
  getFilesByChatId,
  getFilesByMessageIds,
} from "../../db/repository/files.repository.js";
import { getChatRecordById } from "../../db/repository/chats.repository.js";
import type { ChatAttachmentDto } from "@ai-vault/types";

export class FileNotFoundError extends Error {
  constructor(message = "File not found.") {
    super(message);
    this.name = "FileNotFoundError";
  }
}

export interface UploadFileParams {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  chatId?: string;
}

export async function uploadFile(
  params: UploadFileParams,
  sessionToken: string
): Promise<ChatAttachmentDto> {
  const fileId = randomUUID();
  const r2Key = `vault_files/${fileId}.enc`;

  // 1. Encrypt file binary payload with HKDF_INFO_FILES key
  const encryptedBlob = await vaultState.withFileMasterKey(sessionToken, (fileMasterKey) => {
    return encryptFilePayload(params.fileBuffer, fileMasterKey, fileId);
  });

  // 2. Upload encrypted blob to Cloudflare R2
  await uploadToR2(r2Key, encryptedBlob, "application/octet-stream");

  // 3. Encrypt file name for database storage with HKDF_INFO_DB key
  const nameAad = buildFieldAad("chat_file", fileId, "file_name", 1);
  const nameBuffer = Buffer.from(params.fileName.trim(), "utf-8");
  const encName = await vaultState.withDbKey(sessionToken, (dbKey) => {
    return encryptBuffer(nameBuffer, dbKey, nameAad);
  });

  // 4. Save metadata record to database
  let validChatId: string | null = null;
  if (params.chatId) {
    try {
      const existingChat = await getChatRecordById(params.chatId);
      if (existingChat) {
        validChatId = existingChat.id;
      }
    } catch {
      validChatId = null;
    }
  }

  const record = await createFileRecord({
    id: fileId,
    chat_id: validChatId,
    encryption_version: 1,
    encrypted_file_name: encName.ciphertext,
    file_name_iv: encName.iv,
    file_name_tag: encName.tag,
    mime_type: params.mimeType || "application/octet-stream",
    file_size: BigInt(params.fileBuffer.length),
    r2_key: r2Key,
    status: "ACTIVE",
  });

  return {
    id: record.id,
    chatId: record.chat_id,
    messageId: record.message_id,
    name: params.fileName,
    mimeType: record.mime_type,
    size: Number(record.file_size),
    createdAt: record.created_at.toISOString(),
  };
}

export async function getFile(
  fileId: string,
  sessionToken: string
): Promise<{ name: string; mimeType: string; data: Buffer }> {
  const record = await getFileRecordById(fileId);
  if (!record || record.status !== "ACTIVE") {
    throw new FileNotFoundError();
  }

  // 1. Decrypt file name from database
  const nameAad = buildFieldAad("chat_file", record.id, "file_name", record.encryption_version);
  const decryptedName = await vaultState.withDbKey(sessionToken, (dbKey) => {
    const buf = decryptBuffer(
      {
        ciphertext: record.encrypted_file_name,
        iv: record.file_name_iv,
        tag: record.file_name_tag,
      },
      dbKey,
      nameAad
    );
    return buf.toString("utf-8");
  });

  // 2. Download encrypted blob from Cloudflare R2
  const encryptedBlob = await downloadFromR2(record.r2_key);

  // 3. Decrypt file payload with HKDF_INFO_FILES key
  const data = await vaultState.withFileMasterKey(sessionToken, (fileMasterKey) => {
    return decryptFilePayload(encryptedBlob, fileMasterKey, record.id);
  });

  return {
    name: decryptedName,
    mimeType: record.mime_type,
    data,
  };
}

export async function listChatFiles(
  chatId: string,
  sessionToken: string
): Promise<ChatAttachmentDto[]> {
  const records = await getFilesByChatId(chatId);

  return await vaultState.withDbKey(sessionToken, (dbKey) => {
    const items: ChatAttachmentDto[] = [];

    for (const rec of records) {
      let name = "[Encrypted file]";
      try {
        const nameAad = buildFieldAad("chat_file", rec.id, "file_name", rec.encryption_version);
        name = decryptBuffer(
          {
            ciphertext: rec.encrypted_file_name,
            iv: rec.file_name_iv,
            tag: rec.file_name_tag,
          },
          dbKey,
          nameAad
        ).toString("utf-8");
      } catch (e) {
        console.warn(`Failed to decrypt file name for record (${rec.id}):`, e);
      }

      items.push({
        id: rec.id,
        chatId: rec.chat_id,
        messageId: rec.message_id,
        name,
        mimeType: rec.mime_type,
        size: Number(rec.file_size),
        createdAt: rec.created_at.toISOString(),
      });
    }

    return items;
  });
}

export async function getAttachmentsForMessages(
  messageIds: string[],
  sessionToken: string
): Promise<Map<string, ChatAttachmentDto[]>> {
  const records = await getFilesByMessageIds(messageIds);
  const map = new Map<string, ChatAttachmentDto[]>();

  await vaultState.withDbKey(sessionToken, (dbKey) => {
    for (const rec of records) {
      if (!rec.message_id) continue;

      let name = "[Encrypted file]";
      try {
        const nameAad = buildFieldAad("chat_file", rec.id, "file_name", rec.encryption_version);
        name = decryptBuffer(
          {
            ciphertext: rec.encrypted_file_name,
            iv: rec.file_name_iv,
            tag: rec.file_name_tag,
          },
          dbKey,
          nameAad
        ).toString("utf-8");
      } catch (e) {
        console.warn(`Failed to decrypt file name for record (${rec.id}):`, e);
      }

      const dto: ChatAttachmentDto = {
        id: rec.id,
        chatId: rec.chat_id,
        messageId: rec.message_id,
        name,
        mimeType: rec.mime_type,
        size: Number(rec.file_size),
        createdAt: rec.created_at.toISOString(),
      };

      const existing = map.get(rec.message_id) || [];
      existing.push(dto);
      map.set(rec.message_id, existing);
    }
  });

  return map;
}
