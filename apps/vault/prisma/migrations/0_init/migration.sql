-- Create dedicated PostgreSQL schema outside 'public'
CREATE SCHEMA IF NOT EXISTS "vault";

-- Table for storing encrypted vault keys and KDF parameters (Single-User Architecture)
CREATE TABLE IF NOT EXISTS "vault"."vault_config" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "version" INT NOT NULL DEFAULT 1,
    "status" VARCHAR(32) NOT NULL DEFAULT 'INITIALIZED',

    -- KDF parameters for Master Password (Argon2id)
    "kdf_algorithm" VARCHAR(32) NOT NULL DEFAULT 'argon2id',
    "kdf_memory_cost" INT NOT NULL DEFAULT 262144, -- 256 MiB in KiB
    "kdf_time_cost" INT NOT NULL DEFAULT 3,        -- 3 iterations
    "kdf_parallelism" INT NOT NULL DEFAULT 1,
    "kdf_salt" VARCHAR(64) NOT NULL,              -- Hex or Base64

    -- Wrapped Vault Master Key using Master Password KEK (AES-256-GCM)
    "wrapped_vault_key" TEXT NOT NULL,             -- Ciphertext
    "wrapped_vault_key_iv" VARCHAR(32) NOT NULL,   -- 12-byte IV / Nonce (Hex)
    "wrapped_vault_key_tag" VARCHAR(32) NOT NULL,  -- 16-byte Auth Tag (Hex)

    -- KDF parameters for Recovery Code
    "recovery_kdf_salt" VARCHAR(64) NOT NULL,

    -- Wrapped Vault Master Key using Recovery Code KEK (AES-256-GCM)
    "wrapped_vault_key_recovery" TEXT NOT NULL,
    "wrapped_vault_key_recovery_iv" VARCHAR(32) NOT NULL,
    "wrapped_vault_key_recovery_tag" VARCHAR(32) NOT NULL,

    -- Timestamps
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for storing encrypted AI Provider API keys (Encrypted with Master Vault Key via AES-256-GCM)
CREATE TABLE IF NOT EXISTS "vault"."ai_api_keys" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "provider" VARCHAR(64) NOT NULL,               -- e.g. 'openai', 'anthropic', 'google', 'groq', etc.
    "name" VARCHAR(128) NOT NULL,                  -- User-friendly label / identifier
    
    -- Encrypted API key (AES-256-GCM)
    "encrypted_key" TEXT NOT NULL,                 -- Ciphertext
    "iv" VARCHAR(32) NOT NULL,                     -- 12-byte IV / Nonce (Hex)
    "tag" VARCHAR(32) NOT NULL,                    -- 16-byte Auth Tag (Hex)

    "is_active" BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table for storing supported AI models per provider
CREATE TABLE IF NOT EXISTS "vault"."models" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "provider" VARCHAR(64) NOT NULL,               -- e.g. 'google', 'openai', 'anthropic', 'deepseek', 'groq'
    "name" VARCHAR(128) NOT NULL,                  -- API model name (e.g. 'gemini-2.5-pro', 'gpt-4o')
    "display_name" VARCHAR(128) NOT NULL,          -- User-friendly label (e.g. 'Gemini 2.5 Pro')
    "description" VARCHAR(255),                    -- Capabilities / description
    "context_window" INT,                          -- Max token window limit
    "input_price_per_1m" DECIMAL(10, 4),           -- Price for 1M input tokens
    "output_price_per_1m" DECIMAL(10, 4),          -- Price for 1M output tokens
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uq_models_provider_name" UNIQUE ("provider", "name")
);

CREATE INDEX IF NOT EXISTS "idx_models_provider" ON "vault"."models" ("provider");

-- ============================================================================
-- Table for storing encrypted conversation threads (Chats)
-- Sensitive metadata (title, custom configurations) is encrypted via DB Key (AES-256-GCM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "vault"."chats" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "encryption_version" INT NOT NULL DEFAULT 1,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',

    -- Encrypted Title (AES-256-GCM via DB Key derived from Master Vault Key)
    -- AAD format: type:chat|id:<chat_id>|field:title|v:<encryption_version>
    "encrypted_title" TEXT NOT NULL,
    "title_iv" VARCHAR(32) NOT NULL,               -- 12-byte IV / Nonce (Hex)
    "title_tag" VARCHAR(32) NOT NULL,              -- 16-byte Auth Tag (Hex)

    -- Encrypted Chat Metadata (system prompt, model settings, tags, etc.)
    -- AAD format: type:chat|id:<chat_id>|field:metadata|v:<encryption_version>
    "encrypted_metadata" TEXT,
    "metadata_iv" VARCHAR(32),
    "metadata_tag" VARCHAR(32),

    -- Encrypted Aggregate Input Tokens (Prompt Tokens) (AES-256-GCM via DB Key)
    -- AAD format: type:chat|id:<chat_id>|field:input_tokens|v:<encryption_version>
    "encrypted_input_tokens" TEXT,
    "input_tokens_iv" VARCHAR(32),
    "input_tokens_tag" VARCHAR(32),

    -- Encrypted Aggregate Output Tokens (Completion Tokens) (AES-256-GCM via DB Key)
    -- AAD format: type:chat|id:<chat_id>|field:output_tokens|v:<encryption_version>
    "encrypted_output_tokens" TEXT,
    "output_tokens_iv" VARCHAR(32),
    "output_tokens_tag" VARCHAR(32),

    -- Encrypted Aggregate Thought Tokens (AES-256-GCM via DB Key)
    -- AAD format: type:chat|id:<chat_id>|field:thought_tokens|v:<encryption_version>
    "encrypted_thought_tokens" TEXT,
    "thought_tokens_iv" VARCHAR(32),
    "thought_tokens_tag" VARCHAR(32),

    -- Encrypted Aggregate Thought Cost (AES-256-GCM via DB Key)
    -- AAD format: type:chat|id:<chat_id>|field:thought_cost|v:<encryption_version>
    "encrypted_thought_cost" TEXT,
    "thought_cost_iv" VARCHAR(32),
    "thought_cost_tag" VARCHAR(32),

    -- Encrypted Aggregate Input Cost (AES-256-GCM via DB Key)
    -- AAD format: type:chat|id:<chat_id>|field:input_cost|v:<encryption_version>
    "encrypted_input_cost" TEXT,
    "input_cost_iv" VARCHAR(32),
    "input_cost_tag" VARCHAR(32),

    -- Encrypted Aggregate Output Cost (AES-256-GCM via DB Key)
    -- AAD format: type:chat|id:<chat_id>|field:output_cost|v:<encryption_version>
    "encrypted_output_cost" TEXT,
    "output_cost_iv" VARCHAR(32),
    "output_cost_tag" VARCHAR(32),

    -- Encrypted Aggregate Total Cost (AES-256-GCM via DB Key)
    -- AAD format: type:chat|id:<chat_id>|field:total_cost|v:<encryption_version>
    "encrypted_total_cost" TEXT,
    "total_cost_iv" VARCHAR(32),
    "total_cost_tag" VARCHAR(32),

    -- Structural Timestamps
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_chats_status" ON "vault"."chats" ("status");
CREATE INDEX IF NOT EXISTS "idx_chats_created_at" ON "vault"."chats" ("created_at");

-- ============================================================================
-- Table for storing encrypted messages within chats
-- Message content and sensitive metadata (token counts, reasoning, tool calls) are encrypted
-- ============================================================================
CREATE TABLE IF NOT EXISTS "vault"."messages" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "chat_id" UUID NOT NULL REFERENCES "vault"."chats" ("id") ON DELETE CASCADE,
    "parent_message_id" UUID REFERENCES "vault"."messages" ("id") ON DELETE SET NULL,
    "sequence_number" INT NOT NULL DEFAULT 1,
    "role" VARCHAR(32) NOT NULL,                     -- 'user', 'assistant', 'system', 'tool'
    "encryption_version" INT NOT NULL DEFAULT 1,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',

    "encrypted_content" TEXT NOT NULL,
    "content_iv" VARCHAR(32) NOT NULL,              -- 12-byte IV / Nonce (Hex)
    "content_tag" VARCHAR(32) NOT NULL,             -- 16-byte Auth Tag (Hex)

    -- Encrypted Sensitive Metadata (tool calls, encrypted timestamps)
    -- AAD format: type:chat_message|id:<message_id>|field:metadata|v:<encryption_version>
    "encrypted_metadata" TEXT,
    "metadata_iv" VARCHAR(32),
    "metadata_tag" VARCHAR(32),

    -- Structural Timestamps
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_messages_chat_id" ON "vault"."messages" ("chat_id");
CREATE INDEX IF NOT EXISTS "idx_messages_chat_sequence" ON "vault"."messages" ("chat_id", "sequence_number");
CREATE INDEX IF NOT EXISTS "idx_messages_parent_id" ON "vault"."messages" ("parent_message_id");
CREATE INDEX IF NOT EXISTS "idx_messages_created_at" ON "vault"."messages" ("created_at");

-- ============================================================================
-- Triggers for automatic updated_at timestamp maintenance
-- ============================================================================
CREATE OR REPLACE FUNCTION "vault"."set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updated_at" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_vault_config_updated_at" ON "vault"."vault_config";
CREATE TRIGGER "trg_vault_config_updated_at"
BEFORE UPDATE ON "vault"."vault_config"
FOR EACH ROW
EXECUTE FUNCTION "vault"."set_updated_at"();

DROP TRIGGER IF EXISTS "trg_ai_api_keys_updated_at" ON "vault"."ai_api_keys";
CREATE TRIGGER "trg_ai_api_keys_updated_at"
BEFORE UPDATE ON "vault"."ai_api_keys"
FOR EACH ROW
EXECUTE FUNCTION "vault"."set_updated_at"();

DROP TRIGGER IF EXISTS "trg_models_updated_at" ON "vault"."models";
CREATE TRIGGER "trg_models_updated_at"
BEFORE UPDATE ON "vault"."models"
FOR EACH ROW
EXECUTE FUNCTION "vault"."set_updated_at"();

DROP TRIGGER IF EXISTS "trg_chats_updated_at" ON "vault"."chats";
CREATE TRIGGER "trg_chats_updated_at"
BEFORE UPDATE ON "vault"."chats"
FOR EACH ROW
EXECUTE FUNCTION "vault"."set_updated_at"();

DROP TRIGGER IF EXISTS "trg_messages_updated_at" ON "vault"."messages";
CREATE TRIGGER "trg_messages_updated_at"
BEFORE UPDATE ON "vault"."messages"
FOR EACH ROW
EXECUTE FUNCTION "vault"."set_updated_at"();


-- ============================================================================
-- Table for storing global application settings (System prompts, limits, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "vault"."settings" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "encryption_version" INT NOT NULL DEFAULT 1,
    
    -- Encrypted Global System Prompt (AES-256-GCM via DB Key)
    -- AAD format: type:settings|id:<id>|field:system_prompt|v:<encryption_version>
    "encrypted_system_prompt" TEXT,
    "system_prompt_iv" VARCHAR(32),
    "system_prompt_tag" VARCHAR(32),
    
    -- Encrypted token limits JSON config containing max output tokens based on cost tier thresholds
    -- Expected JSON format: [{ "max_cost": 0.50, "tokens": 4000 }, { "max_cost": 2.50, "tokens": 2500 }, ...]
    -- AAD format: type:settings|id:<id>|field:token_tiers|v:<encryption_version>
    "encrypted_token_tiers" TEXT,
    "token_tiers_iv" VARCHAR(32),
    "token_tiers_tag" VARCHAR(32),

    -- Financial limits / Cost controls
    -- AAD format: type:settings|id:<id>|field:max_cost_per_request|v:<encryption_version>
    "encrypted_max_cost_per_request" TEXT,
    "max_cost_per_request_iv" VARCHAR(32),
    "max_cost_per_request_tag" VARCHAR(32),
    
    -- Encrypted Chat Title Generation Prompt (AES-256-GCM via DB Key)
    -- AAD format: type:settings|id:<id>|field:title_prompt|v:<encryption_version>
    "encrypted_title_prompt" TEXT,
    "title_prompt_iv" VARCHAR(32),
    "title_prompt_tag" VARCHAR(32),

    -- Settings for Title Generation AI
    "title_api_key_id" UUID REFERENCES "vault"."ai_api_keys" ("id") ON DELETE SET NULL,
    "title_model_id" UUID REFERENCES "vault"."models" ("id") ON DELETE SET NULL,
    
    -- Timestamps
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS "trg_settings_updated_at" ON "vault"."settings";
CREATE TRIGGER "trg_settings_updated_at"
BEFORE UPDATE ON "vault"."settings"
FOR EACH ROW
EXECUTE FUNCTION "vault"."set_updated_at"();


-- Seed default models for common providers
INSERT INTO "vault"."models" ("provider", "name", "display_name", "description", "context_window", "input_price_per_1m", "output_price_per_1m", "is_active")
VALUES
    -- Google Gemini (Gemini 3 Series & Active Versions)
    ('google', 'gemini-3.7-flash', 'Gemini 3.7 Flash', 'Google latest flagship workhorse model for coding, agents, and complex reasoning', 1048576, 0.75, 3.75, true),
    ('google', 'gemini-3.6-flash', 'Gemini 3.6 Flash', 'High-efficiency model optimized for agentic planning and tasks', 1048576, 1.50, 7.50, true),
    ('google', 'gemini-3.5-flash', 'Gemini 3.5 Flash', 'Fast and versatile multimodal model for production workloads', 1048576, 1.50, 9.00, true),
    ('google', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'Cost-sensitive high-throughput automation model', 1048576, 0.30, 2.50, true),
    ('google', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'High-end reasoning flagship for complex domain analysis', 1048576, 2.00, 12.00, true),
    
    -- OpenAI (GPT-5.6 Series & o-Series Reasoning)
    ('openai', 'gpt-5.6-sol', 'GPT-5.6 Sol', 'OpenAI flagship frontier model for complex reasoning, coding, and agents', 200000, 5.00, 30.00, true),
    ('openai', 'gpt-5.6-terra', 'GPT-5.6 Terra', 'Balanced enterprise model with high intelligence and cost-efficiency', 200000, 2.00, 12.00, true),
    ('openai', 'gpt-5.6-luna', 'GPT-5.6 Luna', 'Fast, cost-efficient model for high-volume low-latency workloads', 200000, 0.20, 1.20, true),
    ('openai', 'o3', 'o3', 'Advanced deep reasoning model for hard STEM, math, and logic problems', 200000, 2.00, 8.00, true),
    ('openai', 'gpt-oss-120b', 'GPT-OSS 120B', 'High-capacity open weights model for complex context-heavy workloads', 128000, 0.35, 0.75, true),
    ('openai', 'gpt-oss-20b', 'GPT-OSS 20B', 'Compact, efficient open weights model for general application', 128000, 0.05, 0.20, true),

    -- Anthropic Claude (Claude 5 & Claude 4.5 Series)
    ('anthropic', 'claude-fable-5', 'Claude Fable 5', 'Anthropic most capable flagship model for complex agentic workflows', 200000, 10.00, 50.00, true),
    ('anthropic', 'claude-opus-5', 'Claude Opus 5', 'Enterprise-grade reasoning and complex coding flagship', 200000, 5.00, 25.00, true),
    ('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', 'Standard balanced model offering high speed and frontier intelligence', 200000, 3.00, 15.00, true),
    ('anthropic', 'claude-haiku-4.5', 'Claude Haiku 4.5', 'Ultra-fast lightweight model for daily intelligence and near-frontier speed', 200000, 1.00, 5.00, true),

    -- DeepSeek (DeepSeek V4 Series)
    ('deepseek', 'deepseek-v4-pro', 'DeepSeek V4 Pro', 'Flagship high-capability reasoning and agentic model with thinking mode', 128000, 0.44, 0.88, true),
    ('deepseek', 'deepseek-v4-flash', 'DeepSeek V4 Flash', 'Fast and cost-sensitive model for high-throughput tasks', 128000, 0.14, 0.28, true),

    -- Groq (LPU Ultra-Fast Inference)
    ('groq', 'openai/gpt-oss-120b', 'GPT-OSS 120B (Groq)', 'Ultra-fast 120B reasoning and tool-calling model on Groq LPU', 128000, 0.35, 0.75, true),
    ('groq', 'openai/gpt-oss-20b', 'GPT-OSS 20B (Groq)', 'Sub-second lightweight reasoning model on Groq LPU', 128000, 0.05, 0.20, true),
    ('groq', 'qwen/qwen3.6-27b', 'Qwen 3.6 27B (Groq)', 'High-speed multilingual reasoning model on Groq LPU', 128000, 0.15, 0.60, true),
    ('groq', 'groq/compound', 'Groq Compound', 'Compound system with integrated agent tools served via Groq LPU', 128000, 0.50, 1.50, true)
ON CONFLICT ("provider", "name") DO NOTHING;