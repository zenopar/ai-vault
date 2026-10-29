-- AlterTable
ALTER TABLE "vault"."settings" ADD COLUMN IF NOT EXISTS "budget_control_enabled" BOOLEAN NOT NULL DEFAULT true;

