FROM node:24-alpine AS base
WORKDIR /app

FROM base AS builder
# Copy root configurations for npm workspaces
COPY package.json package-lock.json ./

# Copy packages and web workspace
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
# Vault workspace is needed if there are shared type dependencies, but let's copy all apps just in case the workspace needs them to resolve.
COPY apps/ ./apps/

# Workaround for npm cross-platform optional dependencies bug (Tailwind oxide on Alpine)
RUN rm -f package-lock.json && npm install

# Build the Next.js app in standalone mode
RUN npm run build --workspace=ai-vault

# ---------------------------------------------------------

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Extreme Hardening: Remove package managers and network download tools
RUN rm -rf /sbin/apk /etc/apk /lib/apk /usr/share/apk \
    && rm -f /usr/bin/wget /usr/bin/curl || true

# Extreme Hardening: Strip all SUID/SGID bits to prevent privilege escalation
RUN find / -type f -perm /6000 -exec chmod a-s {} \; || true

# Run as non-root user for security
USER node

# In a Next.js monorepo standalone build, the output structure mirrors the monorepo.
# The server.js is located at ./apps/web/server.js within the standalone folder.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

# Expose port
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the Next.js standalone server
CMD ["node", "apps/web/server.js"]
