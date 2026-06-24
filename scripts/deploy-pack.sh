#!/usr/bin/env bash
# Taichu CMS — 生产部署打包脚本
# 用法: bash scripts/deploy-pack.sh
# 输出: ~/Desktop/taichu-deploy.tar.gz (完整包，含 admin SPA)

set -e
cd "$(dirname "$0")/.."

echo "=== 构建 Admin SPA ==="
cd packages/admin && npx vite build && cd ../..

echo "=== 打包 ==="
tar czf ~/Desktop/taichu-deploy.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.taichu \
  --exclude=.workbuddy \
  --exclude=deliverables \
  --exclude=scripts/pre-commit.sh \
  --exclude=.github \
  .

ls -lh ~/Desktop/taichu-deploy.tar.gz
echo "✅ 打包完成 → ~/Desktop/taichu-deploy.tar.gz"
