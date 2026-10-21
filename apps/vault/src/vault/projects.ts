import { randomUUID } from "node:crypto";
import { vaultState, VaultLockedError } from "./state.js";
import { encryptBuffer, decryptBuffer } from "./crypto.js";
import { buildFieldAad } from "./keys.js";
import {
  createProjectRecord,
  getProjectRecordById,
  getAllProjectsRecords,
  updateProjectRecord,
  deleteProjectRecord,
} from "../db/repository/projects.repository.js";
import type { projects as ProjectRecord } from "@prisma/client";
import type { ProjectDto } from "@ai-vault/types";

export class ProjectNotFoundError extends Error {
  constructor(message = "Project not found.") {
    super(message);
    this.name = "ProjectNotFoundError";
  }
}

export function decryptProjectRecord(record: ProjectRecord, dbKey: Buffer, fallbackName = "Untitled Project"): ProjectDto {
  let name = fallbackName;
  try {
    const nameAad = buildFieldAad("project", record.id, "name", record.encryption_version);
    const decName = decryptBuffer(
      {
        ciphertext: record.encrypted_name,
        iv: record.name_iv,
        tag: record.name_tag,
      },
      dbKey,
      nameAad
    );
    try {
      name = decName.toString("utf-8");
    } finally {
      decName.fill(0);
    }
  } catch (e) {
    console.warn(`Failed to decrypt name for project ${record.id}:`, e);
  }

  let systemPrompt = "";
  if (record.encrypted_system_prompt && record.system_prompt_iv && record.system_prompt_tag) {
    try {
      const promptAad = buildFieldAad("project", record.id, "system_prompt", record.encryption_version);
      const decPrompt = decryptBuffer(
        {
          ciphertext: record.encrypted_system_prompt,
          iv: record.system_prompt_iv,
          tag: record.system_prompt_tag,
        },
        dbKey,
        promptAad
      );
      try {
        systemPrompt = decPrompt.toString("utf-8");
      } finally {
        decPrompt.fill(0);
      }
    } catch (e) {
      console.warn(`Failed to decrypt system_prompt for project ${record.id}:`, e);
    }
  }

  return {
    id: record.id,
    name,
    systemPrompt,
    status: record.status,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

export async function createProject(
  params: { id?: string; name: string; systemPrompt?: string },
  sessionToken: string
): Promise<ProjectDto> {
  const projectId = params.id || randomUUID();
  const rawName = params.name.trim() || "New Project";
  const rawPrompt = params.systemPrompt !== undefined ? params.systemPrompt : "";

  const nameAad = buildFieldAad("project", projectId, "name", 1);
  const promptAad = buildFieldAad("project", projectId, "system_prompt", 1);

  const { encName, encPrompt } = await vaultState.withDbKey(sessionToken, (dbKey) => {
    const eName = encryptBuffer(Buffer.from(rawName, "utf-8"), dbKey, nameAad);
    const ePrompt = encryptBuffer(Buffer.from(rawPrompt, "utf-8"), dbKey, promptAad);
    return { encName: eName, encPrompt: ePrompt };
  });

  const record = await createProjectRecord({
    id: projectId,
    encryption_version: 1,
    status: "ACTIVE",
    encrypted_name: encName.ciphertext,
    name_iv: encName.iv,
    name_tag: encName.tag,
    encrypted_system_prompt: encPrompt.ciphertext,
    system_prompt_iv: encPrompt.iv,
    system_prompt_tag: encPrompt.tag,
  });

  return {
    id: record.id,
    name: rawName,
    systemPrompt: rawPrompt,
    status: record.status,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

export async function listProjects(sessionToken: string): Promise<ProjectDto[]> {
  const records = await getAllProjectsRecords();
  return vaultState.withDbKey(sessionToken, (dbKey) => {
    return records.map((record) => decryptProjectRecord(record, dbKey));
  });
}

export async function getProject(id: string, sessionToken: string): Promise<ProjectDto> {
  const record = await getProjectRecordById(id);
  if (!record || record.status !== "ACTIVE") {
    throw new ProjectNotFoundError();
  }
  return vaultState.withDbKey(sessionToken, (dbKey) => {
    return decryptProjectRecord(record, dbKey);
  });
}

export async function updateProject(
  id: string,
  params: { name?: string; systemPrompt?: string },
  sessionToken: string
): Promise<ProjectDto> {
  const existing = await getProjectRecordById(id);
  if (!existing || existing.status !== "ACTIVE") {
    throw new ProjectNotFoundError();
  }

  const updatePayload: Record<string, any> = {};

  await vaultState.withDbKey(sessionToken, (dbKey) => {
    const version = existing.encryption_version || 1;
    if (params.name !== undefined) {
      const rawName = params.name.trim() || "Untitled Project";
      const nameAad = buildFieldAad("project", id, "name", version);
      const encName = encryptBuffer(Buffer.from(rawName, "utf-8"), dbKey, nameAad);
      updatePayload.encrypted_name = encName.ciphertext;
      updatePayload.name_iv = encName.iv;
      updatePayload.name_tag = encName.tag;
    }

    if (params.systemPrompt !== undefined) {
      const promptAad = buildFieldAad("project", id, "system_prompt", version);
      const encPrompt = encryptBuffer(Buffer.from(params.systemPrompt, "utf-8"), dbKey, promptAad);
      updatePayload.encrypted_system_prompt = encPrompt.ciphertext;
      updatePayload.system_prompt_iv = encPrompt.iv;
      updatePayload.system_prompt_tag = encPrompt.tag;
    }
  });

  if (Object.keys(updatePayload).length > 0) {
    await updateProjectRecord(id, updatePayload);
  }

  return getProject(id, sessionToken);
}

export async function removeProject(id: string, sessionToken?: string): Promise<boolean> {
  if (sessionToken && !vaultState.verifySession(sessionToken)) {
    throw new VaultLockedError();
  }
  if (!vaultState.isUnlocked()) {
    throw new VaultLockedError();
  }

  const existing = await getProjectRecordById(id);
  if (!existing) {
    throw new ProjectNotFoundError();
  }

  await deleteProjectRecord(id);
  return true;
}
