FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
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

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
