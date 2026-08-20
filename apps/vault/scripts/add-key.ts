import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "../src/config.js";

interface CliArgs {
  provider?: string;
  name?: string;
  key?: string;
  token?: string;
  password?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (const arg of args) {
    if (arg.startsWith("--provider=")) {
      result.provider = arg.split("=")[1];
    } else if (arg.startsWith("--name=")) {
      result.name = arg.split("=")[1];
    } else if (arg.startsWith("--key=")) {
      result.key = arg.split("=")[1];
    } else if (arg.startsWith("--token=")) {
      result.token = arg.split("=")[1];
    } else if (arg.startsWith("--password=")) {
      result.password = arg.split("=")[1];
    }
  }

  return result;
}

async function promptUser(): Promise<{ provider: string; name: string; key: string; auth: string }> {
  const rl = readline.createInterface({ input, output });

  try {
    const auth = await rl.question("Enter Master Password or Session Token: ");
    const provider = await rl.question("Enter AI Provider (e.g., openai, anthropic, google, groq): ");
    const name = await rl.question("Enter a label / name for this key (e.g., OpenAI Primary Key): ");
    const key = await rl.question("Enter the raw API Key to encrypt: ");

    return {
      auth: auth.trim(),
      provider: provider.trim(),
      name: name.trim(),
      key: key.trim(),
    };
  } finally {
    rl.close();
  }
}

async function obtainSessionToken(vaultUrl: string, secret: string, authInput: string): Promise<string> {
  // If it's a 64-char hex string, it might already be a session token
  if (/^[a-f0-9]{64}$/i.test(authInput)) {
    return authInput;
  }

  // Otherwise treat as Master Password to unlock and get a session token
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
  console.log("=== AI Vault - Add & Encrypt AI API Key ===");

  const parsed = parseArgs();
  let provider = parsed.provider;
  let name = parsed.name;
  let key = parsed.key;
  let token = parsed.token;
  let password = parsed.password;

  if (!provider || !name || !key || (!token && !password)) {
    const prompted = await promptUser();
    provider = provider || prompted.provider;
    name = name || prompted.name;
    key = key || prompted.key;
    if (!token && !password) {
      if (/^[a-f0-9]{64}$/i.test(prompted.auth)) {
        token = prompted.auth;
      } else {
        password = prompted.auth;
      }
    }
  }

  if (!provider || !name || !key) {
    console.error("❌ Error: All fields (provider, name, key) are required.");
    process.exit(1);
  }

  const vaultUrl = process.env.VAULT_URL || `http://${config.host}:${config.port}`;
  const secret = config.ipcSecret;

  try {
    let sessionToken = token;
    if (!sessionToken && password) {
      console.log("\nAuthenticating with Vault...");
      sessionToken = await obtainSessionToken(vaultUrl, secret, password);
    }

    if (!sessionToken) {
      console.error("❌ Error: Valid session token or master password required.");
      process.exit(1);
    }

    console.log(`Connecting to Vault at ${vaultUrl}...`);

    const res = await fetch(`${vaultUrl}/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vault-secret": secret,
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({
        provider,
        name,
        apiKey: key,
      }),
    });

    const body = (await res.json()) as any;

    if (!res.ok) {
      if (res.status === 401) {
        console.error("❌ Failed: Unauthorized. Invalid or missing session token / IPC secret.");
      } else if (res.status === 403) {
        console.error("❌ Failed: Vault is LOCKED. Please unlock the vault first.");
      } else {
        console.error(`❌ Failed (${res.status}): ${body.error || "Unknown error"}`);
      }
      process.exit(1);
    }

    console.log("\n✔ API Key successfully encrypted with AES-256-GCM and stored in Vault!");
    console.log("--------------------------------------------------");
    console.log(`ID:        ${body.key.id}`);
    console.log(`Provider:  ${body.key.provider}`);
    console.log(`Name:      ${body.key.name}`);
    console.log(`Active:    ${body.key.isActive}`);
    console.log(`Created:   ${body.key.createdAt}`);
    console.log("--------------------------------------------------");
  } catch (err: any) {
    console.error(`❌ Error: ${err.message || err}`);
    process.exit(1);
  }
}

main();
