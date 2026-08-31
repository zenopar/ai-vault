import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    fileParallelism: false, // Ensures DB tests run sequentially without race conditions
    env: {
      VAULT_IPC_SECRET: "test-secret",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/ai_vault_test",
    },
  },
});
