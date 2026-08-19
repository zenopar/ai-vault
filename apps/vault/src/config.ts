import "dotenv/config";

export const config = {
  port: parseInt(process.env["PORT"] || "4000", 10),
  host: process.env["HOST"] || "127.0.0.1",
  databaseUrl: process.env["DATABASE_URL"] || "",
  ipcSecret: process.env["VAULT_IPC_SECRET"] || "asd",
  nodeEnv: process.env["NODE_ENV"] || "development",
};
