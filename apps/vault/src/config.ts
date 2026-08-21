import "dotenv/config";

function resolveIpcSecret(): string {
  const envSecret = process.env["VAULT_IPC_SECRET"];
  if (!envSecret || !envSecret.trim()) {
    throw new Error(
      "VAULT_IPC_SECRET environment variable is required but not set. " +
      "The vault cannot start without a configured IPC secret."
    );
  }
  return envSecret.trim();
}

export const config = {
  port: parseInt(process.env["PORT"] || "4000", 10),
  host: process.env["HOST"] || "127.0.0.1",
  databaseUrl: process.env["DATABASE_URL"] || "",
  ipcSecret: resolveIpcSecret(),
  nodeEnv: process.env["NODE_ENV"] || "development",
};
