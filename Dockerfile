FROM node:20-slim AS base

RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY lib/api-spec/package.json         ./lib/api-spec/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY lib/api-zod/package.json          ./lib/api-zod/package.json
COPY lib/db/package.json               ./lib/db/package.json

RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

COPY artifacts/api-server/ ./artifacts/api-server/
COPY lib/                  ./lib/

RUN pnpm --filter @workspace/api-server run build

FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=base /app/artifacts/api-server/dist      ./artifacts/api-server/dist
COPY --from=base /app/artifacts/api-server/src/bot/assets ./artifacts/api-server/src/bot/assets
COPY --from=base /app/node_modules                   ./node_modules
COPY --from=base /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
