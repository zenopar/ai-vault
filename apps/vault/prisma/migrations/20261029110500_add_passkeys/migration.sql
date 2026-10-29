-- CreateTable
CREATE TABLE IF NOT EXISTS "vault"."passkeys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "credential_id" VARCHAR(512) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "public_key_spki" TEXT NOT NULL,
    "algorithm" INTEGER NOT NULL DEFAULT -7,
    "kdf_salt" VARCHAR(64) NOT NULL,
    "wrapped_vault_key" TEXT NOT NULL,
    "wrapped_vault_key_iv" VARCHAR(32) NOT NULL,
    "wrapped_vault_key_tag" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "passkeys_credential_id_key" ON "vault"."passkeys"("credential_id");

