import "server-only";
import http from "node:http";

export interface VaultResponse<T = unknown> {
  error?: string;
  errorDetails?: string;
  data?: T;
}

export interface VaultRequestOptions {
  sessionToken?: string;
}

export class VaultApiClient {
  private static get vaultUrl() {
    return process.env.VAULT_URL || "http://127.0.0.1:4000";
  }

  private static get ipcSecret() {
    return process.env.VAULT_IPC_SECRET || "";
  }

  private static buildHeaders(options?: VaultRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      "x-vault-secret": this.ipcSecret,
      "Content-Type": "application/json",
    };

    if (options?.sessionToken) {
      headers["x-session-token"] = options.sessionToken;
    }

    return headers;
  }

  /**
   * Universal internal request handler that supports both TCP and Unix Sockets.
   */
  private static request<T>(
    method: string, 
    path: string, 
    body?: unknown, 
    options?: VaultRequestOptions
  ): Promise<VaultResponse<T>> {
    return new Promise((resolve) => {
      const isUnixSocket = this.vaultUrl.startsWith("unix://");
      
      let reqOptions: http.RequestOptions;
      if (isUnixSocket) {
        // Handle communication via Unix Socket file
        reqOptions = {
          socketPath: this.vaultUrl.replace("unix://", ""),
          path: path,
          method: method,
          headers: this.buildHeaders(options)
        };
      } else {
        // Fallback for local development (http://127.0.0.1:4000)
        const url = new URL(path, this.vaultUrl);
        reqOptions = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: method,
          headers: this.buildHeaders(options)
        };
      }

      const req = http.request(reqOptions, (res) => {
        let responseData = "";
        res.on("data", (chunk) => { responseData += chunk; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              // Some responses might not be JSON (e.g. empty 204), but we always send json.
              const data = responseData ? JSON.parse(responseData) : {};
              resolve({ data });
            } catch (e) {
              resolve({ error: "Invalid JSON from Vault", errorDetails: responseData });
            }
          } else {
            resolve({ error: `Vault error ${res.statusCode}`, errorDetails: responseData });
          }
        });
      });

      req.on("error", (error) => {
        console.error(`${method} request failed to ${path}:`, error);
        resolve({ error: "Vault connection error", errorDetails: error.message });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  static async sendGetRequest<T>(path: string, options?: VaultRequestOptions): Promise<VaultResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  static async sendPostRequest<T, B = Record<string, unknown>>(
    path: string, 
    body: B, 
    options?: VaultRequestOptions
  ): Promise<VaultResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  static async sendPutRequest<T, B = Record<string, unknown>>(
    path: string, 
    body: B, 
    options?: VaultRequestOptions
  ): Promise<VaultResponse<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  static async sendDeleteRequest<T>(path: string, options?: VaultRequestOptions): Promise<VaultResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  static requestBinary(
    method: string,
    path: string,
    body?: Buffer,
    options?: VaultRequestOptions & { customHeaders?: Record<string, string> }
  ): Promise<{
    statusCode: number;
    contentType?: string;
    contentDisposition?: string;
    data?: Buffer;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const isUnixSocket = this.vaultUrl.startsWith("unix://");
      const headers: Record<string, string> = {
        ...this.buildHeaders(options),
        ...(options?.customHeaders || {}),
      };

      if (body) {
        headers["Content-Length"] = Buffer.byteLength(body).toString();
        if (!options?.customHeaders?.["Content-Type"] && !options?.customHeaders?.["content-type"]) {
          headers["Content-Type"] = "application/octet-stream";
        }
      }

      let reqOptions: http.RequestOptions;
      if (isUnixSocket) {
        reqOptions = {
          socketPath: this.vaultUrl.replace("unix://", ""),
          path: path,
          method: method,
          headers,
        };
      } else {
        const url = new URL(path, this.vaultUrl);
        reqOptions = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: method,
          headers,
        };
      }

      const req = http.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const statusCode = res.statusCode || 500;
          const data = Buffer.concat(chunks);
          const contentType = res.headers["content-type"];
          const contentDisposition = res.headers["content-disposition"];

          if (statusCode >= 200 && statusCode < 300) {
            resolve({ statusCode, contentType, contentDisposition, data });
          } else {
            let errorMsg = `Vault error ${statusCode}`;
            try {
              const errObj = JSON.parse(data.toString("utf-8"));
              if (errObj.error) errorMsg = errObj.error;
            } catch {}
            resolve({ statusCode, contentType, error: errorMsg, data });
          }
        });
      });

      req.on("error", (error) => {
        console.error(`${method} binary request failed to ${path}:`, error);
        resolve({ statusCode: 500, error: error.message });
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}