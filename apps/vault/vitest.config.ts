import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    fileParallelism: false, // Ensures DB tests run sequentially without race conditions
  },
});
