# deps stage has python/make/g++ for native modules (better-sqlite3) when no prebuilt binary matches
FROM node:22 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY web ./web
COPY prompts ./prompts
COPY seed ./seed
COPY scripts ./scripts
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/careops.db KB_URL=http://careops-kb:3838
USER node
EXPOSE 3000
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/main.js"]
