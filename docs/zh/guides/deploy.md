# 部署指南

## Docker

```bash
docker pull claudelaw/taichu:latest
docker run -d -p 3120:3120 -v taichu-data:/app/.taichu \
  -e TAICHU_STORAGE=sqlite \
  -e TAICHU_PUBLIC_READ=1 \
  --name taichu \
  --restart unless-stopped \
  claudelaw/taichu:latest
```

## 阿里云 ECS

```bash
# 安装 Node.js 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 克隆并启动
git clone https://gitee.com/Caludelaw/Taichu.git
cd Taichu

# 配置环境变量
cat > .env << EOF
TAICHU_STORAGE=sqlite
TAICHU_PORT=3120
TAICHU_HOST=0.0.0.0
TAICHU_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
EOF

# 持久化运行
npm install -g pm2
pm2 start packages/server/src/index.js --name taichu
pm2 save
pm2 startup
```

## 腾讯云轻量应用服务器

```bash
# 同阿里云 ECS 步骤，替换 clone URL 为 Gitee 镜像
git clone https://gitee.com/Caludelaw/Taichu.git
cd Taichu && npm start
```

## Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3120;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> WebSocket 需要 `Upgrade` 和 `Connection` 头支持。

## 备份策略

SQLite 数据库文件位于 `.taichu/data/taichu.db`，建议：

```bash
# 定时备份（crontab，每天凌晨 3 点）
0 3 * * * cp /path/to/taichu/.taichu/data/taichu.db /backup/taichu-$(date +\%Y\%m\%d).db
```
