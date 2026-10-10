FROM node:20-alpine AS build
WORKDIR /app
# mongodb-memory-server (tests only) must not download a mongod binary during the image build.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# --chmod: sources on exFAT/Windows drives arrive as owner-only (0700) files.
COPY --chmod=644 package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
# Create role/validators/indexes (root creds) → seed (idempotent) → start the API.
CMD ["sh", "-c", "node dist/scripts/setup-db-roles.js && node dist/scripts/seed.js && exec node dist/server.js"]
