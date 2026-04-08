# Build TypeScript
FROM node:20-alpine AS build
WORKDIR /usr/src/app
COPY package*.json tsconfig.json ./
COPY src ./src
RUN npm ci
RUN npm run build

# Production image
FROM node:20-alpine
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/out ./out

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=6144"

# Default: continuous loop mode. Override with docker run ... node out/bin/run-sync.js
CMD [ "node", "out/bin/main.js" ]
