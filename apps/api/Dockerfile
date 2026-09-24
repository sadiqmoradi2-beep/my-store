# MY STORE API — build with the monorepo root as context:
#   docker build -f apps/api/Dockerfile -t my-store-api .
FROM node:20-alpine AS base
WORKDIR /app

# ── deps: install all workspaces (package-lock.json needs the full graph) ──
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

# ── build: compile shared, then api ──
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build -w apps/api

# ── runtime: production deps only + built output ──
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma

EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/src/main.js"]
