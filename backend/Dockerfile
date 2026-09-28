# Construit depuis la RACINE du depot (contexte = ".", voir docker-compose.yml)
# afin de pouvoir embarquer le dossier db/migrations aux cotes du code de l'API.

# --- Stage 1 : build des dependances (reproductible via package-lock.json) ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 2 : image de production, allegee ---
FROM node:20-alpine AS production

ENV NODE_ENV=production
ENV MIGRATIONS_DIR=/app/db/migrations
WORKDIR /app

# Utilisateur non-root dedie (bonne pratique securite)
RUN addgroup -S formy && adduser -S formy -G formy

COPY --from=builder /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/public ./public
COPY db ./db

RUN chown -R formy:formy /app
USER formy

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
