import { 
  getAllModels, 
  getModelsByProvider, 
  getModelById, 
  type ModelRecord 
} from "../db/repository/models.repository.js";
import { AiModelMetadata } from "@ai-vault/types";

function mapModelRecordToMetadata(record: ModelRecord): AiModelMetadata {
  return {
    id: record.id,
    provider: record.provider,
    name: record.name,
    displayName: record.display_name,
    description: record.description,
    contextWindow: record.context_window,
    isActive: record.is_active,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

/**
 * Lists models, optionally filtered by provider.
 */
export async function listModels(provider?: string): Promise<AiModelMetadata[]> {
  const records = provider 
    ? await getModelsByProvider(provider)
    : await getAllModels();

  return records.map(mapModelRecordToMetadata);
}

/**
 * Gets a model by ID.
 */
export async function getModel(id: string): Promise<AiModelMetadata | null> {
  const record = await getModelById(id);
  if (!record) return null;
  return mapModelRecordToMetadata(record);
}
