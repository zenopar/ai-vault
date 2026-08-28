# Personal Secure AI Platform (AI Vault)

## Overview
A self-hosted, single-user AI chat platform designed with uncompromising security and privacy in mind. This open-source platform allows the owner to interact with AI models (like Gemini) using their own API keys, ensuring that all conversations, metadata, and uploaded files remain entirely confidential and encrypted at rest.

There are no user registrations or complex multi-tenant architectures—just a single master password that acts as the key to unlock the vault.

> **Architectural Classification:** This project is a **Zero-Trust Storage Architecture with a Trusted AI Execution Boundary**. The storage layer (PostgreSQL) is treated as untrusted.

---

## Core Requirements (Currently Implemented)
1. **Single-User Architecture**: No multi-tenant registration. The entire platform is guarded by a single Master Password.
2. **Application-Level Encryption (Encryption at Rest)**: Sensitive data stored in PostgreSQL (prompts, AI responses, chat titles, metadata) is strongly encrypted before insertion. The database never stores plaintext sensitive data.
3. **Decoupled Architecture**: A Next.js web application handles the UI/API, while a segregated, heavily isolated **Vault Service** handles all cryptography and key memory.

---

## Installation & Usage

### Prerequisites
Before you begin, ensure you have the following installed on your system:
- **[Docker](https://docs.docker.com/get-docker/)** (Docker Desktop for Windows/Mac, or Docker Engine with the Compose plugin for Linux)
- **[Git](https://git-scm.com/downloads)** (to clone the repository)

### Quick Start

The most secure and recommended way to deploy AI Vault is using Docker Compose.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/zenopar/ai-vault.git
   cd ai-vault
   ```

2. **Configure environment variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set the required variables. Generate strong random secrets for `VAULT_IPC_SECRET` and `ALTCHA_SECRET` (e.g., using `openssl rand -hex 32`). Also, provide secure database credentials.

3. **Start the platform:**
   To start the platform using the pre-built Docker images, first pull the latest images and then start the services:
   ```bash
   docker compose pull
   docker compose up -d
   ```
   *(Optional: If you prefer to build the images locally from source, you can run `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build` instead).*

   > **Note:** If you start the services *before* configuring your `.env` file, the PostgreSQL database will initialize with default credentials. If you change the database credentials later, you must delete the existing database volume by running `docker compose down -v` before starting it again.

4. **Access the application:**
   Navigate to `http://localhost:3000` in your browser. On your first visit, you will be prompted to create your Master Password and unlock the vault.

---

## Architecture & Security Design

To prevent a vulnerability in the web framework from compromising the cryptographic keys, the architecture strictly decouples the web layer from the cryptographic runtime:

```text
                     INTERNET
                         │
                         ▼
                    Reverse Proxy (TLS + Rate Limit)
                         │
                         ▼
                 ┌─────────────────┐
                 │   Next.js App   │
                 │ (UI / API Layer)│
                 │ *NO VAULT KEYS* │
                  └────────┬────────┘
                           │
            Authenticated IPC (Unix Socket via tmpfs)
                           │
                           ▼
                  ┌──────────────────┐
                 │  VAULT SERVICE   │
                 │ (Isolate Memory) │
                 │                  │
                 │ - Vault Key      │
                 │ - DB Key         │
                 │ - Secrets Key    │
                 └───────┬──────────┘
                         │
            ┌────────────┴─────────────┐
            ▼                          ▼
       PostgreSQL                 AI Providers
    (Ciphertext Only)          (Plaintext payload)
```

### 1. Threat Model & Security Boundaries

#### Fundamental Security Limits & Explicit Boundaries:
- **Trusted AI Provider Boundary**: The AI provider (e.g., Gemini, OpenAI) **must receive plaintext prompts** to process requests. This architecture protects stored data from storage hosts, not from the AI provider handling active requests. *Recommendation: Use API tiers with explicit zero-data-retention policies (e.g., Enterprise tiers) so your plaintext prompts are not used for model training.*
- **Trusted Vault Service Boundary**: The isolated Vault Service holds the keys in RAM while the vault is unlocked. If an attacker gains RCE inside the Vault Service container itself, the vault is compromised.
- **Next.js RCE Resilience & IPC Impact**: If an attacker gains RCE in the Next.js container, they cannot steal the Master Vault Keys or Database Keys, as Next.js does not hold them. However, **if the vault is currently unlocked**, the attacker can abuse legitimate IPC calls to read all plaintext conversations accessible to the active session. The IPC channel itself is strictly authenticated using a shared secret (`VAULT_IPC_SECRET`) over a read-only Unix socket mounted via tmpfs (`/var/run/ipc/vault.sock`), preventing unauthorized local processes from interacting with the Vault Service.

---

### 2. Key Management Lifecycle & Hierarchy

```text
                   MASTER PASSWORD
                          │
          Argon2id (Verified library, 256 MiB)
                          │
                Key Encryption Key (KEK)
                          │
                   AES-GCM Unwrap
                          │
             VAULT MASTER KEY (256-bit Random)
                          │
           ┌──────────────┴──────────────┐
           │ (Immediately wrapped in RAM)│
           ▼                             ▼
    SESSION TOKEN A               SESSION TOKEN B
 (Raw 256-bit AES-GCM Key)     (Raw 256-bit AES-GCM Key)
           │                             │
    AES-GCM Wrapped               AES-GCM Wrapped
   Vault Key in RAM              Vault Key in RAM
  [Plaintext Wiped]             [Plaintext Wiped]
           │                             │
  (Transient Decryption)        (Transient Decryption)
           ▼                             ▼
       ┌───────────────────┴───────────────────┐
       │                                       │
   HKDF-SHA256                             HKDF-SHA256
       ▼                                       ▼
    DB Key                                Secrets Key
 ("ai-vault/db/v1")                   ("ai-vault/secrets/v1")
```

1. **Vault Initialization**:
   - A cryptographically secure 256-bit random **Vault Key** is generated.
   - Master Password + Random Salt are derived using a verified **Argon2id** library (not native Node PBKDF2).
   - Explicit KDF parameters (`kdf_algorithm`, `memory_cost`, `time_cost`, `salt`) are stored in plaintext to allow future migrations.
2. **Immediate Plaintext Zeroization & In-Memory Session Wrapping**:
   - Upon initialization (`initVault`) or unlocking (`unlockVault`), the plaintext `vaultKey` is **immediately encrypted in RAM** with a 256-bit key derived directly from the issued `sessionToken` (using AES-256-GCM bound to `AAD_WRAPPED_VAULT_KEY_SESSION`).
   - The plaintext `vaultKey` buffer is **immediately overwritten with zeros (`.fill(0)`) and wiped from memory**.
   - At rest in RAM, **zero plaintext master keys exist**.
3. **Domain Separation via HKDF**:
   Sub-keys (`dbKey`, `secretsKey`) are derived on demand during authenticated execution scopes using HKDF with explicit domain info strings (e.g., `"ai-vault/db/v1"`).
4. **Dual Recovery Mechanism**:
   A high-entropy 256-bit Recovery Code is generated on setup. The Vault Key is wrapped *twice* and stored in the database:
   - `wrapped_vault_key` (Unwrapped by Master Password KEK)
   - `wrapped_vault_key_recovery` (Unwrapped by Recovery Code KEK)
   *Note: Neither the Master Password nor the Recovery Code are ever stored in the database.*
   > **Zero-Knowledge Trade-off:** There is no "forgot password" email flow. If you lose both your Master Password and the Recovery Code, your data is mathematically unrecoverable and permanently lost. This is an explicit design choice.

---

### 3. Session & Vault State Management

- **Zero-Plaintext In-Memory Architecture**:
  - The client holds the opaque 256-bit random `sessionToken` in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie / `x-session-token` header.
  - The Vault Service memory stores only:
    $$\text{sessions: Map}\langle \text{SHA256}(\text{sessionToken}), \{ \text{wrappedVaultKey}, \text{expiresAt} \} \rangle$$
  - The raw session token is **never** permanently stored in the Vault Service's memory.
- **Transient Scoped Key Decryption**:
  - When an authorized request arrives with `x-session-token`, the vault verifies the hash against its active sessions map.
  - The raw session token transiently decrypts the `vaultKey` and derives the required sub-key (`dbKey` or `secretsKey`) exclusively for the duration of the request callback.
  - In a `finally` block, all decrypted plaintext key buffers are **strictly zeroized (`.fill(0)`)**.
- **Multi-Session Isolation**:
  - If a user unlocks or logs in from multiple devices/tabs, each session receives its own `sessionToken` and holds an independent encrypted instance of the `vaultKey` in RAM.
  - Destroying or expiring one session revokes only that instance and leaves other active sessions unaffected.
- **Memory Dump Protection**:
  - If an attacker obtains a memory dump of the running Vault Service, they only see AES ciphertexts and SHA-256 hashes. Without the client's session token held on the client device, the vault key cannot be decrypted.
- **Explicit Vault State (LOCKED / UNLOCKED)**:
  - The vault is considered `UNLOCKED` when at least one active, non-expired session exists in memory.
  - **Inactivity Auto-Lock & Expiry**: Sessions expire after their designated TTL (default 24h) or inactivity period.
  - **Manual Lock**: Instantly clears all active session records from RAM, resetting the vault to `LOCKED`.

---

### 4. Database Encryption (PostgreSQL)

#### Metadata Segregation:
- **Structural Metadata (Plaintext)**: `id` (UUID), `key_version`, `encryption_version`, `status`.
- **Sensitive Metadata (Encrypted)**: `title`, `model`, `token_count`, `timestamps`. (Timestamps and token counts are encrypted to prevent temporal metadata leakage).

#### Ciphertext AAD Binding:
Every encrypted database field binds contextual metadata into AES-GCM Additional Authenticated Data (AAD) to prevent record swapping:
```text
AAD = "vault_id:" + vault_id + "|type:" + record_type + "|id:" + record_id + "|field:" + field_name + "|v:" + version
```

---

### 5. Defense-in-Depth & Infrastructure Hardening

- **Anti-Brute-Force**:
  - **Server-Side Rate Limiting**: Progressive delays and lockout policies are the primary defense against online guessing.
  - **Client-Side Proof of Work (Altcha)**: Supplements rate limiting by forcing the attacker to burn 1-2 seconds of CPU time per attempt.
- **Container & Host Hardening**:
  - Vault Service & Next.js run as `non-root` (`USER node`).
  - Drop all Linux capabilities: `--cap-drop=ALL`.
  - Enforce `no-new-privileges:true`.
  - Enforce strict `seccomp` profiles and memory/CPU limits.
  - Read-only root filesystem with `tmpfs` mounts.
  - **Memory Leaks Mitigation**: Node.js lacks native `mlock()` primitives. To prevent plaintext keys from leaking to disk during memory pressure or crashes, **swap must be explicitly disabled on the host** (or fully encrypted), `--max-old-space-size` limits enforced, and core/crash dumps completely disabled in production.
- **Network Isolation (Docker Compose)**:
  - **Database (`db`)**: Isolated on an internal `db_internal` network. No public exposure.
  - **Web App (`web`)**: Isolated on an internal `web_offline` network. **It has absolutely zero outbound internet access.** It can only communicate with the Vault Service via the Unix Socket.
  - **Vault Service (`vault`)**: Connected to `db_internal` and an `outbound_only` network to communicate with AI Providers.
- **No Plaintext Telemetry**:
  - Strict audit of logging middleware. `console.error` and application traces must NEVER capture API keys, decrypted prompts, or Vault Keys.
- **Encrypted Backups**:
  - Database dumps (`pg_dump`) contain only wrapped keys and encrypted payloads. They are mathematically useless without the Master Password or Recovery Code.

---

## Recommended Tech Stack Implementation
- **Frontend / API**: Next.js (App Router, Server Actions with strict CSRF/Session validation per mutation).
- **Vault Service**: Node.js microservice utilizing a verified Argon2id package and native `crypto` module (AES-GCM, HKDF).
- **Database**: PostgreSQL with Prisma ORM (Exclusively accessed and managed by the Vault Service; Next.js has zero database credentials).
- **AI Integration**: Vercel AI SDK.

---

## Future Roadmap / To Be Added

1. **Encrypted Object Storage (Cloudflare R2)**:
   - Allow uploading files (images, videos, documents).
   - Authenticated and encrypted in chunks *before* transmission to Cloudflare.
   - Cloudflare will only store opaque encrypted binary blobs under randomized UUID keys.
   - Per-File Key Derivation: `FileSpecificKey = HKDF(FileMasterKey, salt=file_id)`.
   - Authenticated Chunking with deterministic nonce and Authenticated File Manifest to prevent file truncation or missing chunk attacks.
2. **Ephemeral In-Memory Search (FlexSearch)**:
   - Upon vault unlock, spawn a dedicated worker to load and decrypt chat records into a volatile RAM search index.
   - The index would be destroyed entirely when the vault locks or the service restarts.

---

## Project Status & Contributions
This is a personal project built tailored to individual needs. Pull requests and external contributions are generally not accepted unless strictly necessary. Feel free to fork and adapt the repository for your own personal use.

---

## License
This project is open-source and licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
