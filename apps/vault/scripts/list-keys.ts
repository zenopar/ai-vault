import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "../src/config.js";

interface CliArgs {
  token?: string;
  password?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (const arg of args) {
    if (arg.startsWith("--token=")) {
      result.token = arg.split("=")[1];
    } else if (arg.startsWith("--password=")) {
      result.password = arg.split("=")[1];
    }
  }

  return result;
}

async function obtainSessionToken(vaultUrl: string, secret: string, authInput: string): Promise<string> {
  if (/^[a-f0-9]{64}$/i.test(authInput)) {
    return authInput;
  }

  const res = await fetch(`${vaultUrl}/unlock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vault-secret": secret,
    },
    body: JSON.stringify({ password: authInput }),
  });

  const data = (await res.json()) as any;
  if (!res.ok || !data.sessionToken) {
    throw new Error(data.error || "Failed to authenticate with master password.");
  }

  return data.sessionToken;
}

async function main() {
  console.log("=== AI Vault - List AI API Keys ===");

  const parsed = parseArgs();
  let token = parsed.token;
  let password = parsed.password;

  if (!token && !password) {
    const rl = readline.createInterface({ input, output });
    try {
      const auth = await rl.question("Enter Master Password or Session Token: ");
      if (/^[a-f0-9]{64}$/i.test(auth.trim())) {
        token = auth.trim();
      } else {
        password = auth.trim();
      }
    } finally {
      rl.close();
    }
  }

  const vaultUrl = process.env.VAULT_URL || `http://${config.host}:${config.port}`;
  const secret = config.ipcSecret;

  try {
    let sessionToken = token;
    if (!sessionToken && password) {
      console.log("Authenticating with Vault...");
      sessionToken = await obtainSessionToken(vaultUrl, secret, password);
    }

    if (!sessionToken) {
      console.error("❌ Error: Valid session token or master password required.");
      process.exit(1);
    }

    const res = await fetch(`${vaultUrl}/keys`, {
      method: "GET",
      headers: {
        "x-vault-secret": secret,
        "x-session-token": sessionToken,
      },
    });

    const body = (await res.json()) as any;

    if (!res.ok) {
      console.error(`❌ Failed (${res.status}): ${body.error || "Unknown error"}`);
      process.exit(1);
    }

    const keys = body.keys || [];
    if (keys.length === 0) {
      console.log("\nNo API keys found in the vault.");
      return;
    }

    console.log(`\nFound ${keys.length} API key(s):\n`);
    for (const k of keys) {
      console.log(`- [${k.provider.toUpperCase()}] ${k.name}`);
      console.log(`  ID:      ${k.id}`);
      console.log(`  Active:  ${k.isActive}`);
      if (k.models && k.models.length > 0) {
        console.log(`  Models:  ${k.models.map((m: any) => m.name).join(", ")}`);
      }
      console.log(`  Created: ${k.createdAt}`);
      console.log("");
    }
  } catch (err: any) {
    console.error(`❌ Connection error: ${err.message || err}`);
    process.exit(1);
  }
}

main();
