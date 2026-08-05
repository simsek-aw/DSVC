# Multi-stage build: compile shared/server/client, then ship a lean runtime
# image with only production dependencies plus the built output.

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install

COPY shared shared
COPY server server
COPY client client
RUN npm run build:shared \
 && npm run build -w server \
 && npm run build -w client

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install --omit=dev --workspace=shared --workspace=server

COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/server/dist server/dist
COPY --from=builder /app/client/dist client/dist

EXPOSE 8080
ENV PORT=8080
CMD ["node", "server/dist/index.js"]
