# MY STORE Web — build with the monorepo root as context:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 -t my-store-web .
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w packages/shared
RUN npm run build -w apps/web

# ── runtime: Next.js standalone output (includes its own pruned node_modules) ──
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public

EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
