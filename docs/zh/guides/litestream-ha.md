# Litestream 高可用集成指南

Taichu CMS 内置 Litestream 零配置高可用支持，实现 SQLite 数据库的持续 S3 实时备份和秒级恢复。

## 概述

Litestream 是一个开源的 SQLite 持续复制工具，以 sidecar 进程运行，将 WAL 日志增量同步到 S3 兼容存储（AWS S3、MinIO、Backblaze B2、Cloudflare R2 等）。

**当前状态：** 基础架构就绪（配置文件、Docker Compose HA、restore CLI）。Taichu 默认使用 sql.js（WASM 版 SQLite），不产生 OS 级 WAL 文件。完全启用 Litestream 需要迁移到 `better-sqlite3` 原生 SQLite 驱动。

## 快速开始

### 1. 安装 Litestream

```bash
# macOS
brew install litestream

# Linux
wget https://github.com/benbjohnson/litestream/releases/latest/download/litestream-linux-amd64.tar.gz
tar xzf litestream-linux-amd64.tar.gz
sudo mv litestream /usr/local/bin/

# Docker
docker pull litestream/litestream:latest
```

### 2. 配置 S3 存储

```bash
# 设置 S3 凭证环境变量
export LITESTREAM_ACCESS_KEY_ID=your-access-key
export LITESTREAM_SECRET_ACCESS_KEY=your-secret-key
export LITESTREAM_S3_BUCKET=taichu-backups
export LITESTREAM_S3_REGION=us-east-1
```

### 3. 启动 Litestream 复制

```bash
litestream replicate -config litestream.yml
```

## Docker Compose 高可用部署

使用 `docker-compose.ha.yml` 一键启动带 Litestream sidecar 的 Taichu：

```bash
# 1. 创建 .env 文件
cat > .env << EOF
TAICHU_SECRET=your-production-secret
TAICHU_ADMIN_USER=admin
TAICHU_ADMIN_PASS=your-strong-password
LITESTREAM_ACCESS_KEY_ID=your-s3-access-key
LITESTREAM_SECRET_ACCESS_KEY=your-s3-secret-key
LITESTREAM_S3_BUCKET=taichu-backups
LITESTREAM_S3_REGION=us-east-1
EOF

# 2. 启动
docker compose -f docker-compose.ha.yml up -d

# 3. 验证
docker compose -f docker-compose.ha.yml ps
docker compose -f docker-compose.ha.yml logs litestream
```

## 数据库恢复

### 从 Litestream S3 恢复

```bash
# 方法一：CLI 一键恢复
npx taichu restore --litestream

# 方法二：手动恢复
litestream restore -config litestream.yml -o taichu-restored.db
cp taichu-restored.db .taichu/data/taichu.db
```

### 从本地备份恢复

```bash
npx taichu restore ./backups/taichu-20260623.db
```

### 查看数据库状态

```bash
npx taichu restore --status
```

## 支持的 S3 兼容存储

| 提供商 | ENDPOINT | 说明 |
|--------|----------|------|
| AWS S3 | （留空） | 默认，自动检测区域 |
| Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` | 无出口费用 |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | 低成本 |
| MinIO | `http://minio:9000` | 自托管 |
| 阿里云 OSS | `https://oss-<region>.aliyuncs.com` | S3 兼容模式 |
| 腾讯云 COS | `https://cos.<region>.myqcloud.com` | S3 兼容模式 |

## 配置文件参考

```yaml
dbs:
  - path: /app/.taichu/data/taichu.db
    replicas:
      - type: s3
        bucket: "${LITESTREAM_S3_BUCKET}"
        path: taichu/db
        region: "${LITESTREAM_S3_REGION}"
        sync-interval: 1s
        retention: 720h        # 30天
        snapshot-interval: 6h  # 每6小时全量快照
```

## 架构说明

```
┌──────────────────────────┐
│     Taichu CMS           │
│  ┌──────────────────┐    │
│  │  SQLite (WAL)     │    │
│  │  .taichu/data/    │    │
│  │  taichu.db        │◄───┤── 持续复制 WAL
│  └──────────────────┘    │
│         │                 │
│    taichu-data volume     │
│         │                 │
│  ┌──────▼───────────┐    │
│  │   Litestream      │    │
│  │   (sidecar)       │    │
│  │   replicate       │────┼── 增量同步
│  └──────────────────┘    │
└──────────────────────────┘
           │
    ┌──────▼──────┐
    │  S3 Storage  │
    │ (AWS/MinIO/  │
    │  B2/R2/...)  │
    └─────────────┘
```

## 当前限制与迁移路径

**sql.js WASM 限制：** Taichu 当前使用 sql.js（SQLite 编译为 WebAssembly），不支持 OS 级 WAL 文件。这意味着 Litestream 无法直接监控数据库变更。

**迁移到 better-sqlite3（计划中）：** 替换 sql.js 为原生 `better-sqlite3` 后，Litestream 可获得完整的 WAL 复制能力。此迁移涉及：
- 安装原生依赖（需要 node-gyp 编译工具链）
- 修改 SQLiteStore 初始化代码（API 兼容）
- 验证所有现有测试通过

迁移完成后，`docker-compose.ha.yml` 和 `litestream.yml` 即可直接使用。

## 监控

Litestream 暴露 Prometheus metrics（默认端口 9091）：

```yaml
# docker-compose.ha.yml 中添加
litestream:
  ports:
    - "9091:9091"
```

关键指标：
- `litestream_replication_lag_seconds` — 复制延迟
- `litestream_snapshot_total` — 快照计数
- `litestream_wal_bytes_synced` — WAL 同步字节数

## 参考

- [Litestream 官方文档](https://litestream.io/)
- [Litestream GitHub](https://github.com/benbjohnson/litestream)
- [SQLite WAL 模式](https://www.sqlite.org/wal.html)
