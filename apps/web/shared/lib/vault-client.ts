import "server-only";

export interface VaultResponse<T = unknown> {
  error?: string;
  errorDetails?: string;
  data?: T;
}

export class VaultApiClient {
  private static get vaultUrl() {
    return process.env.VAULT_URL || "http://127.0.0.1:4000";
  }

  private static get ipcSecret() {
    return process.env.VAULT_IPC_SECRET || "";
  }

  /**
   * Sends a GET request to the specified path on the Vault service.
   * Automatically attaches the IPC secret for authentication.
   */
  static async sendGetRequest<T>(path: string): Promise<VaultResponse<T>> {
    try {
      const response = await fetch(`${this.vaultUrl}${path}`, {
        method: "GET",
        headers: {
          "x-vault-secret": this.ipcSecret,
          "Content-Type": "application/json",
        },
        // Crucial for real-time applications: disable caching
        cache: "no-store",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vault error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as T;
      return { data };
    } catch (error) {
      console.error(`GET request failed to ${path}:`, error);
      // Return a special error object so the frontend knows the Vault is unreachable
      return { error: "Vault connection error", errorDetails: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  static async sendPostRequest<T, B = Record<string, unknown>>(path: string, body: B): Promise<VaultResponse<T>> {
    try {
      const response = await fetch(`${this.vaultUrl}${path}`, {
        method: "POST",
        headers: {
          "x-vault-secret": this.ipcSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vault error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as T;
      return { data };
    } catch (error) {
      console.error(`POST request failed to ${path}:`, error);
      return { error: "Vault connection error", errorDetails: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}