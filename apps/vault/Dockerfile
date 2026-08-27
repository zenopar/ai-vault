FROM node:24-alpine AS builder
WORKDIR /app

# Copy root configurations for npm workspaces
COPY package.json package-lock.json ./

# Copy packages and vault workspace
COPY packages/ ./packages/
COPY apps/vault/ ./apps/vault/

# Install dependencies
RUN npm install

# Generate Prisma Client
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npm run db:generate --workspace=@ai-vault/vault

# Build the TypeScript code
RUN npm run build --workspace=@ai-vault/vault

# Remove devDependencies to keep the runner image small
RUN npm prune --omit=dev

# ---------------------------------------------------------

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Extreme Hardening: Remove package managers and network download tools
RUN rm -rf /sbin/apk /etc/apk /lib/apk /usr/share/apk \
    && rm -f /usr/bin/wget /usr/bin/curl || true

# Extreme Hardening: Strip all SUID/SGID bits to prevent privilege escalation
RUN find / -type f -perm /6000 -exec chmod a-s {} \; || true

# Run as non-root user for security
USER node

# Copy from builder with correct ownership
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/vault/package.json ./apps/vault/package.json
COPY --from=builder --chown=node:node /app/apps/vault/dist ./apps/vault/dist
COPY --from=builder --chown=node:node /app/apps/vault/prisma ./apps/vault/prisma
COPY --from=builder --chown=node:node /app/apps/vault/prisma.config.ts ./apps/vault/prisma.config.ts

EXPOSE 4000
ENV PORT=4000

# Start the Vault service
CMD ["node", "apps/vault/dist/src/server.js"]
