-- CreateTable
CREATE TABLE IF NOT EXISTS "vault"."projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "encryption_version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "encrypted_name" TEXT NOT NULL,
    "name_iv" VARCHAR(32) NOT NULL,
    "name_tag" VARCHAR(32) NOT NULL,
    "encrypted_system_prompt" TEXT,
    "system_prompt_iv" VARCHAR(32),
    "system_prompt_tag" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_projects_status" ON "vault"."projects"("status");
CREATE INDEX IF NOT EXISTS "idx_projects_created_at" ON "vault"."projects"("created_at");

-- AlterTable
ALTER TABLE "vault"."chats" ADD COLUMN IF NOT EXISTS "project_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_chats_project_id" ON "vault"."chats"("project_id");

-- AddForeignKey
ALTER TABLE "vault"."chats" ADD CONSTRAINT "chats_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "vault"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Trigger for projects updated_at
DROP TRIGGER IF EXISTS "trg_projects_updated_at" ON "vault"."projects";
CREATE TRIGGER "trg_projects_updated_at"
BEFORE UPDATE ON "vault"."projects"
FOR EACH ROW
EXECUTE FUNCTION "vault"."set_updated_at"();

-- Update Gemini models: remove gemini-3.7-flash, add gemini-4-argon and gemini-3.8-flash
DELETE FROM "vault"."models" WHERE "provider" = 'google' AND "name" = 'gemini-3.7-flash';

INSERT INTO "vault"."models" ("provider", "name", "display_name", "description", "context_window", "input_price_per_1m", "output_price_per_1m", "is_active")
VALUES
    ('google', 'gemini-4-argon', 'Gemini 4 Argon', 'Google next-generation frontier model for advanced reasoning, coding, and agentic tasks', 1048576, 2.00, 10.00, true),
    ('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash', 'Google latest flagship workhorse model for coding, agents, and complex reasoning', 1048576, 0.75, 3.75, true)
ON CONFLICT ("provider", "name") DO UPDATE SET
    "display_name" = EXCLUDED."display_name",
    "description" = EXCLUDED."description",
    "input_price_per_1m" = EXCLUDED."input_price_per_1m",
    "output_price_per_1m" = EXCLUDED."output_price_per_1m",
    "is_active" = true;
