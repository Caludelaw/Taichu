#!/usr/bin/env node
/**
 * Taichu Restore CLI — 从备份恢复数据库
 *
 * 用法：
 *   npx taichu restore <backup-path>     从本地备份文件恢复
 *   npx taichu restore --litestream      从 Litestream S3 备份恢复
 *   npx taichu restore --s3-key=<key>    指定 S3 恢复密钥
 *
 * 与 Litestream 集成：
 *   litestream restore -config litestream.yml taichu.db
 *   然后运行本命令验证恢复结果。
 */

import { existsSync, copyFileSync, renameSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

function usage() {
  console.log(`
  ⚡ Taichu Restore — 数据库恢复工具

  用法:
    npx taichu restore <backup-path>      从本地备份文件恢复
    npx taichu restore --litestream       从 Litestream S3 恢复（需 litestream.yml）
    npx taichu restore --status           显示当前数据库状态

  环境变量:
    TAICHU_DATA_DIR     数据目录（默认 .taichu/data）
    LITESTREAM_CONFIG    Litestream 配置文件路径（默认 litestream.yml）

  示例:
    # 从本地备份恢复
    npx taichu restore ./backups/taichu-20260623.db

    # 从 Litestream S3 恢复
    litestream restore -config litestream.yml taichu-restored.db
    npx taichu restore ./taichu-restored.db

    # 查看数据库状态
    npx taichu restore --status
`);
}

function getDbPath() {
  const dataDir = process.env.TAICHU_DATA_DIR || join(process.cwd(), '.taichu', 'data');
  return join(dataDir, 'taichu.db');
}

function getBackupPath(dbPath) {
  const dir = join(dbPath, '..');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return join(dir, `taichu-backup-${ts}.db`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  const dbPath = getDbPath();

  // --status: show current database info
  if (args.includes('--status')) {
    console.log(`\n📊 Taichu 数据库状态\n`);
    console.log(`  数据目录: ${join(dbPath, '..')}`);
    if (existsSync(dbPath)) {
      const stats = statSync(dbPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`  数据库:   ${dbPath} (${sizeMB} MB)`);
      console.log(`  最后修改: ${stats.mtime.toISOString()}`);
      console.log(`  状态:     ✅ 正常\n`);
    } else {
      console.log(`  数据库:   ${dbPath} (不存在)`);
      console.log(`  状态:     ⚠️  尚未创建（首次启动后自动创建）\n`);
    }

    // Check for Litestream config
    const litestreamConfig = process.env.LITESTREAM_CONFIG || join(process.cwd(), 'litestream.yml');
    if (existsSync(litestreamConfig)) {
      console.log(`  Litestream: 已配置 (${litestreamConfig})`);
    } else {
      console.log(`  Litestream: 未配置（创建 litestream.yml 启用 HA）`);
    }
    process.exit(0);
  }

  // --litestream: restore from Litestream S3
  if (args.includes('--litestream')) {
    const litestreamConfig = process.env.LITESTREAM_CONFIG || join(process.cwd(), 'litestream.yml');
    if (!existsSync(litestreamConfig)) {
      console.error(`❌ Litestream 配置文件未找到: ${litestreamConfig}`);
      console.error(`   请创建 litestream.yml 并配置 S3 凭证`);
      process.exit(1);
    }

    const restorePath = join(dbPath, '..', 'taichu-restored.db');
    console.log(`\n🔄 从 Litestream S3 恢复数据库...`);
    console.log(`   配置: ${litestreamConfig}`);
    console.log(`   目标: ${restorePath}`);

    try {
      execSync(`litestream restore -config "${litestreamConfig}" -o "${restorePath}"`, {
        stdio: 'inherit',
        timeout: 300000
      });
      console.log(`\n✅ 恢复完成！备份 -> ${restorePath}`);

      // Backup current DB before replacing
      if (existsSync(dbPath)) {
        const backupPath = getBackupPath(dbPath);
        renameSync(dbPath, backupPath);
        console.log(`   旧数据库已备份到: ${backupPath}`);
      }

      copyFileSync(restorePath, dbPath);
      console.log(`   已替换当前数据库: ${dbPath}`);
      console.log(`\n💡 重启 Taichu 服务器以加载恢复的数据。\n`);
    } catch (e) {
      console.error(`\n❌ Litestream 恢复失败: ${e.message}`);
      console.error(`   请确保已安装 litestream: https://litestream.io/install/`);
      process.exit(1);
    }
    process.exit(0);
  }

  // Restore from local backup file
  const backupPath = args[0];
  if (!existsSync(backupPath)) {
    console.error(`❌ 备份文件未找到: ${backupPath}`);
    process.exit(1);
  }

  console.log(`\n🔄 从本地备份恢复数据库...`);
  console.log(`   备份: ${backupPath}`);
  console.log(`   目标: ${dbPath}`);

  // Backup current DB before replacing
  if (existsSync(dbPath)) {
    const currentBackup = getBackupPath(dbPath);
    renameSync(dbPath, currentBackup);
    console.log(`   旧数据库已备份到: ${currentBackup}`);
  }

  copyFileSync(backupPath, dbPath);
  const stats = statSync(dbPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ 恢复完成！(${sizeMB} MB)`);
  console.log(`\n💡 重启 Taichu 服务器以加载恢复的数据。\n`);
}

main().catch((err) => {
  console.error(`\n❌ 恢复失败: ${err.message}`);
  process.exit(1);
});
