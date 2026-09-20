-- CreateTable
CREATE TABLE "vault"."chat_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chat_id" UUID,
    "message_id" UUID,
    "encryption_version" INTEGER NOT NULL DEFAULT 1,
    "encrypted_file_name" TEXT NOT NULL,
    "file_name_iv" VARCHAR(32) NOT NULL,
    "file_name_tag" VARCHAR(32) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "r2_key" VARCHAR(512) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_chat_files_chat_id" ON "vault"."chat_files"("chat_id");
CREATE INDEX "idx_chat_files_message_id" ON "vault"."chat_files"("message_id");
CREATE INDEX "idx_chat_files_created_at" ON "vault"."chat_files"("created_at");

-- AddForeignKey
ALTER TABLE "vault"."chat_files" ADD CONSTRAINT "chat_files_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "vault"."chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vault"."chat_files" ADD CONSTRAINT "chat_files_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "vault"."messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
