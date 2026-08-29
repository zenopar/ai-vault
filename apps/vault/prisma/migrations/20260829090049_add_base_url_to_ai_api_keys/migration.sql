-- AlterTable
ALTER TABLE "vault"."ai_api_keys" 
  ADD COLUMN "encrypted_base_url" TEXT,
  ADD COLUMN "base_url_iv" VARCHAR(32),
  ADD COLUMN "base_url_tag" VARCHAR(32);
