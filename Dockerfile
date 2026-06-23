# Taichu CMS — Docker 镜像
#
# 构建: docker build -t taichu .
# 运行: docker run -p 3120:3120 -v taichu-data:/app/.taichu taichu
#
# 默认使用 SQLite 存储，数据持久化到 .taichu/ 目录。

FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/mcp/package.json packages/mcp/
COPY packages/admin/package.json packages/admin/
COPY packages/llm-providers/package.json packages/llm-providers/

# Install dependencies (ignore-scripts to skip prepare hook in non-git context)
RUN npm install --omit=dev --ignore-scripts || npm install --ignore-scripts

# Copy source
COPY . .

# Build admin SPA
RUN cd packages/admin && npx vite build 2>/dev/null || echo "Admin build skipped (pre-built)"

FROM node:22-alpine

WORKDIR /app

# Copy only what's needed for runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/core ./packages/core
COPY --from=builder /app/packages/server ./packages/server
COPY --from=builder /app/packages/mcp ./packages/mcp

ENV NODE_ENV=production
ENV TAICHU_STORAGE=sqlite
ENV TAICHU_PORT=3120
ENV TAICHU_HOST=0.0.0.0

EXPOSE 3120

VOLUME ["/app/.taichu"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3120/api/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.exit(d.includes('ok')?0:1))})"

CMD ["node", "packages/server/src/index.js"]
