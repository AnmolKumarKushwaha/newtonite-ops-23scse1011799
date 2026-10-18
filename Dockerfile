FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate && pnpm install --frozen-lockfile
COPY . .
RUN npm run build:local
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
WORKDIR /app
COPY --from=build /app/dist-local ./dist-local
COPY --from=build /app/server ./server
COPY --from=build /app/lib/core.mjs ./lib/core.mjs
COPY --from=build /app/drizzle ./drizzle
RUN mkdir data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node","server/local.mjs"]
