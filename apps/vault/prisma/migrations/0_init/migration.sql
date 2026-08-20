-- Create dedicated PostgreSQL schema outside 'public'
CREATE SCHEMA IF NOT EXISTS "vault";

-- Table for storing encrypted vault keys and KDF parameters (Single-User Architecture)
CREATE TABLE IF NOT EXISTS "vault"."vault_config" (
    "id" VARCHAR(36) PRIMARY KEY,
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
    "id" VARCHAR(36) PRIMARY KEY,
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
    "id" VARCHAR(36) PRIMARY KEY,
    "provider" VARCHAR(64) NOT NULL,               -- e.g. 'google', 'openai', 'anthropic', 'deepseek', 'groq'
    "name" VARCHAR(128) NOT NULL,                  -- API model name (e.g. 'gemini-2.5-pro', 'gpt-4o')
    "display_name" VARCHAR(128) NOT NULL,          -- User-friendly label (e.g. 'Gemini 2.5 Pro')
    "description" VARCHAR(255),                    -- Capabilities / description
    "context_window" INT,                          -- Max token window limit
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_models_provider" ON "vault"."models" ("provider");

-- Seed default models for common providers
INSERT INTO "vault"."models" ("id", "provider", "name", "display_name", "description", "context_window", "is_active")
VALUES
    -- Google Gemini (Gemini 3 Series & Active Versions)
    ('model-google-gemini-3.7-flash', 'google', 'gemini-3.7-flash', 'Gemini 3.7 Flash', 'Google latest flagship workhorse model for coding, agents, and complex reasoning', 1048576, true),
    ('model-google-gemini-3.6-flash', 'google', 'gemini-3.6-flash', 'Gemini 3.6 Flash', 'High-efficiency model optimized for agentic planning and tasks', 1048576, true),
    ('model-google-gemini-3.5-flash', 'google', 'gemini-3.5-flash', 'Gemini 3.5 Flash', 'Fast and versatile multimodal model for production workloads', 1048576, true),
    ('model-google-gemini-3.5-flash-lite', 'google', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'Cost-sensitive high-throughput automation model', 1048576, true),
    ('model-google-gemini-3.1-pro-preview', 'google', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'High-end reasoning flagship for complex domain analysis', 1048576, true),
    
    -- OpenAI (GPT-5.6 Series & o-Series Reasoning)
    ('model-openai-gpt-5.6-sol', 'openai', 'gpt-5.6-sol', 'GPT-5.6 Sol', 'OpenAI flagship frontier model for complex reasoning, coding, and agents', 200000, true),
    ('model-openai-gpt-5.6-terra', 'openai', 'gpt-5.6-terra', 'GPT-5.6 Terra', 'Balanced enterprise model with high intelligence and cost-efficiency', 200000, true),
    ('model-openai-gpt-5.6-luna', 'openai', 'gpt-5.6-luna', 'GPT-5.6 Luna', 'Fast, cost-efficient model for high-volume low-latency workloads', 200000, true),
    ('model-openai-o3', 'openai', 'o3', 'o3', 'Advanced deep reasoning model for hard STEM, math, and logic problems', 200000, true),
    ('model-openai-gpt-oss-120b', 'openai', 'gpt-oss-120b', 'GPT-OSS 120B', 'High-capacity open weights model for complex context-heavy workloads', 128000, true),
    ('model-openai-gpt-oss-20b', 'openai', 'gpt-oss-20b', 'GPT-OSS 20B', 'Compact, efficient open weights model for general application', 128000, true),

    -- Anthropic Claude (Claude 5 & Claude 4.5 Series)
    ('model-anthropic-claude-fable-5', 'anthropic', 'claude-fable-5', 'Claude Fable 5', 'Anthropic most capable flagship model for complex agentic workflows', 200000, true),
    ('model-anthropic-claude-opus-5', 'anthropic', 'claude-opus-5', 'Claude Opus 5', 'Enterprise-grade reasoning and complex coding flagship', 200000, true),
    ('model-anthropic-claude-sonnet-5', 'anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', 'Standard balanced model offering high speed and frontier intelligence', 200000, true),
    ('model-anthropic-claude-haiku-4.5', 'anthropic', 'claude-haiku-4-5', 'Claude Haiku 4.5', 'Ultra-fast lightweight model for daily intelligence and near-frontier speed', 200000, true),

    -- DeepSeek (DeepSeek V4 Series)
    ('model-deepseek-v4-pro', 'deepseek', 'deepseek-v4-pro', 'DeepSeek V4 Pro', 'Flagship high-capability reasoning and agentic model with thinking mode', 128000, true),
    ('model-deepseek-v4-flash', 'deepseek', 'deepseek-v4-flash', 'DeepSeek V4 Flash', 'Fast and cost-sensitive model for high-throughput tasks', 128000, true),

    -- Groq (LPU Ultra-Fast Inference)
    ('model-groq-gpt-oss-120b', 'groq', 'openai/gpt-oss-120b', 'GPT-OSS 120B (Groq)', 'Ultra-fast 120B reasoning and tool-calling model on Groq LPU', 128000, true),
    ('model-groq-gpt-oss-20b', 'groq', 'openai/gpt-oss-20b', 'GPT-OSS 20B (Groq)', 'Sub-second lightweight reasoning model on Groq LPU', 128000, true),
    ('model-groq-qwen3.6-27b', 'groq', 'qwen/qwen3.6-27b', 'Qwen 3.6 27B (Groq)', 'High-speed multilingual reasoning model on Groq LPU', 128000, true),
    ('model-groq-compound', 'groq', 'groq/compound', 'Groq Compound', 'Compound system with integrated agent tools served via Groq LPU', 128000, true)
ON CONFLICT ("id") DO NOTHING;




