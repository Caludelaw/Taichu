#!/usr/bin/env bash
# =========================================================================
# Taichu CMS — liuhuaian.com 一键部署脚本
# 服务器: 118.25.105.54 (腾讯云轻量)
# 运行: bash deploy-taichu.sh
# =========================================================================
set -e

GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' NC='\033[0m'
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Taichu CMS 部署 — liuhuaian.com      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"

# ── 1. 环境检查 ────────────────────────────────────────
echo -e "\n${YELLOW}[1/6] 检查环境...${NC}"
sudo docker --version 2>/dev/null || { echo -e "${RED}请先安装 Docker${NC}"; exit 1; }
sudo nginx -v 2>&1 | grep nginx || { echo -e "${RED}请先安装 Nginx${NC}"; exit 1; }
echo -e "${GREEN}✅ Docker + Nginx 就绪${NC}"

# ── 2. 拉取镜像 ────────────────────────────────────────
echo -e "\n${YELLOW}[2/6] 拉取 Taichu 镜像...${NC}"
sudo docker pull claudelaw/taichu:latest
echo -e "${GREEN}✅ 镜像拉取完成${NC}"

# ── 3. 创建目录和配置 ─────────────────────────────────
echo -e "\n${YELLOW}[3/6] 创建配置...${NC}"
mkdir -p ~/taichu/data
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_PASS=$(openssl rand -hex 8)

cat > ~/taichu/.env << ENVEOF
TAICHU_SECRET=$JWT_SECRET
TAICHU_ADMIN_USER=admin
TAICHU_ADMIN_PASS=$ADMIN_PASS
ENVEOF
chmod 600 ~/taichu/.env
echo -e "${GREEN}✅ 配置生成完成${NC}"

# ── 4. 启动容器 ────────────────────────────────────────
echo -e "\n${YELLOW}[4/6] 启动容器...${NC}"
sudo docker rm -f taichu-cms 2>/dev/null || true
sudo docker run -d \
  --name taichu-cms \
  --restart unless-stopped \
  -p 127.0.0.1:3120:3120 \
  -v ~/taichu/data:/app/.taichu \
  --env-file ~/taichu/.env \
  -e NODE_ENV=production \
  -e TAICHU_STORAGE=sqlite \
  -e TAICHU_PORT=3120 \
  -e TAICHU_HOST=0.0.0.0 \
  -e TAICHU_PUBLIC_READ=1 \
  claudelaw/taichu:latest

# 等容器启动
sleep 5
curl -s http://127.0.0.1:3120/api/health | grep -q '"ok"' && echo -e "${GREEN}✅ 容器运行正常${NC}" || echo -e "${YELLOW}⚠️ 容器启动中，稍后检查${NC}"

# ── 5. Nginx 配置 ──────────────────────────────────────
echo -e "\n${YELLOW}[5/6] 配置 Nginx...${NC}"
sudo tee /etc/nginx/sites-available/liuhuaian.com > /dev/null << 'NGINXEOF'
server {
    listen 80;
    server_name liuhuaian.com www.liuhuaian.com;

    # 管理后台
    location /admin {
        proxy_pass http://127.0.0.1:3120;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api {
        proxy_pass http://127.0.0.1:3120;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket (实时更新)
    location /ws {
        proxy_pass http://127.0.0.1:3120;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 静态文件 + 前端页面
    location / {
        proxy_pass http://127.0.0.1:3120;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

# 启用站点
sudo ln -sf /etc/nginx/sites-available/liuhuaian.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
echo -e "${GREEN}✅ Nginx 配置完成${NC}"

# ── 6. SSL 证书 (Let's Encrypt) ─────────────────────────
echo -e "\n${YELLOW}[6/6] 配置 SSL 证书...${NC}"
if command -v certbot &>/dev/null; then
  sudo certbot --nginx -d liuhuaian.com -d www.liuhuaian.com --non-interactive --agree-tos -m admin@liuhuaian.com 2>/dev/null && echo -e "${GREEN}✅ SSL 证书配置完成${NC}" || echo -e "${YELLOW}⚠️ SSL 配置跳过 (可手动运行 certbot)${NC}"
else
  echo -e "${YELLOW}⚠️ certbot 未安装，跳过 SSL。手动安装: sudo apt install certbot python3-certbot-nginx${NC}"
fi

# ── 完成 ───────────────────────────────────────────────
echo -e "\n${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 部署完成！                        ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  站点: http://liuhuaian.com            ║${NC}"
echo -e "${GREEN}║  管理: http://liuhuaian.com/admin/     ║${NC}"
echo -e "${GREEN}║  用户: admin                           ║${NC}"
echo -e "${GREEN}║  密码: $ADMIN_PASS            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"

echo -e "\n${YELLOW}# 备份命令 (加入 crontab -e)${NC}"
echo -e "0 3 * * * cp ~/taichu/data/taichu.db ~/taichu/backup/taichu-\$(date +\\%Y\\%m\\%d).db"
echo ""
echo -e "${YELLOW}# 查看日志:${NC}  sudo docker logs taichu-cms"
echo -e "${YELLOW}# 重启服务:${NC}  sudo docker restart taichu-cms"
