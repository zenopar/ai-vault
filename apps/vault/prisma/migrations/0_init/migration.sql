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

