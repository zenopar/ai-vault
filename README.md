# Personal Secure AI Platform (AI Vault)

## Overview
A self-hosted, single-user AI chat platform designed with uncompromising security and privacy in mind. This open-source platform allows the owner to interact with AI models (like Gemini) using their own API keys, ensuring that all conversations, metadata, and uploaded files remain entirely confidential and encrypted at rest.

There are no user registrations or complex multi-tenant architectures—just a single master password that acts as the key to unlock the vault.

> **Architectural Classification:** This project is a **Zero-Trust Storage Architecture with a Trusted AI Execution Boundary**. The storage layer (PostgreSQL, Cloudflare R2) is treated as untrusted.

---

## Core Requirements
1. **Single-User Architecture**: No multi-tenant registration. The entire platform is guarded by a single Master Password.
2. **Application-Level Encryption (Encryption at Rest)**: Sensitive data stored in PostgreSQL (prompts, AI responses, chat titles, metadata) is strongly encrypted before insertion. The database never stores plaintext sensitive data.
3. **Encrypted Object Storage**: Files (images, videos, documents) uploaded to Cloudflare R2 are authenticated and encrypted in chunks *before* transmission. Cloudflare only stores opaque encrypted binary blobs under randomized UUID keys.
4. **Decoupled Architecture**: A Next.js web application handles the UI/API, while a segregated, heavily isolated **Vault Service** handles all cryptography, key memory, and search indexing.

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
             Authenticated IPC (Unix Socket / mTLS)
                           │
                           ▼
                  ┌──────────────────┐
                 │  VAULT SERVICE   │
                 │ (Isolate Memory) │
                 │                  │
                 │ - Vault Key      │
                 │ - DB Key         │
                 │ - File Key       │
                 │ - Secrets Key    │
                 │ - Search Index   │
                 └───────┬──────────┘
                         │
            ┌────────────┼─────────────┐
            ▼            ▼             ▼
       PostgreSQL        R2        AI Providers
    (Ciphertext Only) (Encrypted)  (Plaintext payload)
```

### 1. Threat Model & Security Boundaries

#### Fundamental Security Limits & Explicit Boundaries:
- **Trusted AI Provider Boundary**: The AI provider (e.g., Gemini, OpenAI) **must receive plaintext prompts and media** to process requests. This architecture protects stored data from storage hosts, not from the AI provider handling active requests. *Recommendation: Use API tiers with explicit zero-data-retention policies (e.g., Enterprise tiers) so your plaintext prompts are not used for model training.*
- **Trusted Vault Service Boundary**: The isolated Vault Service holds the keys in RAM while the vault is unlocked. If an attacker gains RCE inside the Vault Service container itself, the vault is compromised.
- **Next.js RCE Resilience & IPC Impact**: If an attacker gains RCE in the Next.js container, they cannot steal the Master Vault Keys or Database Keys, as Next.js does not hold them. However, **if the vault is currently unlocked**, the attacker can abuse legitimate IPC calls to read all plaintext conversations accessible to the active session. The IPC channel itself should be strictly authenticated (e.g., restricted Unix socket or container-to-container mTLS) to prevent unauthorized local processes from interacting with the Vault Service.

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
      ┌───────────────────┼───────────────────┐
      │                   │                   │
  HKDF-SHA256        HKDF-SHA256         HKDF-SHA256
      ▼                   ▼                   ▼
   DB Key             File Master Key      Secrets Key
("ai-vault/db/v1") ("ai-vault/files/v1") ("ai-vault/secrets/v1")
```

1. **Vault Initialization**:
   - A cryptographically secure 256-bit random **Vault Key** is generated.
   - Master Password + Random Salt are derived using a verified **Argon2id** library (not native Node PBKDF2).
     - *Target*: e.g., 256 MiB memory, 3 iterations, tuned to ~1s compute time on the host server.
   - Explicit KDF parameters (`kdf_algorithm`, `memory_cost`, `time_cost`, `salt`) are stored in plaintext to allow future migrations.
2. **Domain Separation via HKDF**:
   Sub-keys are derived using HKDF with explicit domain info strings (e.g., `"ai-vault/db/v1"`).
3. **Dual Recovery Mechanism**:
   A high-entropy 256-bit Recovery Code is generated on setup. The Vault Key is wrapped *twice* and stored in the database:
   - `wrapped_vault_key` (Unwrapped by Master Password KEK)
   - `wrapped_vault_key_recovery` (Unwrapped by Recovery Code KEK)
   *Note: Neither the Master Password nor the Recovery Code are ever stored in the database.*
   > **Zero-Knowledge Trade-off:** There is no "forgot password" email flow. If you lose both your Master Password and the Recovery Code, your data is mathematically unrecoverable and permanently lost. This is an explicit design choice.

---

### 3. Session & Vault State Management

- **Hashed Session Tokens**:
  - The client receives an opaque 256-bit random `session_id` in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
  - The database only stores `H(session_id)` (the hash of the token), preventing an attacker with a DB dump from immediately hijacking active sessions.
- **Explicit Vault State (LOCKED / UNLOCKED)**:
  - The Vault Service manages the state. Unwrapped keys reside exclusively in the Vault Service memory.
  - **Inactivity Auto-Lock**: Automatically locks after 15–30 minutes of idle time.
  - **Manual Lock**: Instantly purges active cryptographic sub-keys from RAM, destroys the ephemeral search index, and invalidates active session contexts.

---

### 4. Database Encryption (PostgreSQL)

#### Metadata Segregation:
- **Structural Metadata (Plaintext)**: `id` (UUID), `key_version`, `encryption_version`, `status`.
- **Sensitive Metadata (Encrypted)**: `title`, `filename`, `mime_type`, `model`, `token_count`, `timestamps`. (Timestamps and token counts are encrypted to prevent temporal metadata leakage).

#### Ciphertext AAD Binding:
Every encrypted database field binds contextual metadata into AES-GCM Additional Authenticated Data (AAD) to prevent record swapping:
```text
AAD = "vault_id:" + vault_id + "|type:" + record_type + "|id:" + record_id + "|field:" + field_name + "|v:" + version
```

#### Ephemeral In-Memory Search:
- Upon vault unlock, the Vault Service spawns a dedicated worker to load and decrypt chat records into a volatile RAM search index (e.g., `FlexSearch`).
- The index is destroyed entirely when the vault locks or the service restarts.

---

### 5. File & Media Encryption (Cloudflare R2)

1. **Per-File Key Derivation**:
   - The File Master Key does not encrypt files directly. It derives a unique key for every file:
   - `FileSpecificKey = HKDF(FileMasterKey, salt=file_id, info="ai-vault/file/v1")`
2. **Authenticated Chunking**:
   - Files are encrypted in chunks using AES-GCM. Instead of random nonces (which carry a theoretical birthday-bound collision risk), each chunk uses a **deterministic nonce** derived from its `chunk_index` (e.g., using a counter or HKDF of the index).
   - `AAD = vault_id + file_id + chunk_index + total_chunks + version`
3. **Authenticated File Manifest**:
   - To prevent file truncation or missing chunk attacks, the database stores an authenticated manifest containing the total chunk count, exact sizes, and cryptographic tags for the entire file assembly.
4. **Storage Obscurity**:
   - R2 object keys are purely random UUIDs. The vault only has IAM permissions to `PutObject`, `GetObject`, and `DeleteObject`.

---

### 6. Defense-in-Depth & Infrastructure Hardening

- **Anti-Brute-Force**:
  - **Server-Side Rate Limiting**: Progressive delays and lockout policies are the primary defense against online guessing.
  - **Client-Side Proof of Work (Altcha)**: Supplements rate limiting by forcing the attacker to burn 1-2 seconds of CPU time per attempt.
- **Container & Host Hardening**:
  - Vault Service & Next.js run as `non-root` (`USER node`).
  - Drop all Linux capabilities: `--cap-drop=ALL`.
  - Enforce `no-new-privileges:true`.
  - Enforce strict `seccomp` profiles and memory/CPU limits.
  - Read-only root filesystem with `tmpfs` mounts.
  - **Memory Leaks Mitigation**: Node.js lacks native `mlock()` primitives. To prevent plaintext keys or the FlexSearch index from leaking to disk during memory pressure or crashes, **swap must be explicitly disabled on the host** (or fully encrypted), `--max-old-space-size` limits enforced, and core/crash dumps completely disabled in production.
- **Network Isolation & DB Exposure**:
  - **Ingress**: The PostgreSQL database must **not** be exposed to the public internet. An attacker must first compromise the VPS (or internal network) to even reach the database port.
  - **Egress (Default-Deny)**: Outbound network traffic is whitelisted ONLY to the specific IP ranges/domains of PostgreSQL, Cloudflare R2, and AI Provider APIs. All other traffic (including local subnets) is dropped to neutralize SSRF attacks.
- **No Plaintext Telemetry**:
  - Strict audit of logging middleware. `console.error` and application traces must NEVER capture API keys, decrypted prompts, or Vault Keys.
- **Encrypted Backups**:
  - Database dumps (`pg_dump`) contain only wrapped keys and encrypted payloads. They are mathematically useless without the Master Password or Recovery Code.

---

## Recommended Tech Stack Implementation
- **Frontend / API**: Next.js (App Router, Server Actions with strict CSRF/Session validation per mutation).
- **Vault Service**: Node.js microservice utilizing a verified Argon2id package and native `crypto` module (AES-GCM, HKDF).
- **Database**: PostgreSQL with Prisma ORM.
- **AI Integration**: Vercel AI SDK.

---

## Project Status & Contributions
This is a personal project built tailored to individual needs. Pull requests and external contributions are generally not accepted unless strictly necessary. Feel free to fork and adapt the repository for your own personal use.

---

## License
This project is open-source and licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
