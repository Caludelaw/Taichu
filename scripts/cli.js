#!/usr/bin/env node
/**
 * Taichu CLI — Quick Start
 *
 * npx taichu init          → Create a new Taichu project
 * npx taichu dev            → Start development server
 * npx taichu migrate --from=wordpress --file=dump.xml
 * npx taichu restore <path> → 恢复数据库备份
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cmd = process.argv[2];

switch (cmd) {
  case 'init': {
    const dir = process.argv[3] || 'taichu-project';
    if (existsSync(dir)) {
      console.log(`Directory "${dir}" already exists.`);
      process.exit(1);
    }
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, '.taichu', 'data'), { recursive: true });
    mkdirSync(join(dir, 'plugins'), { recursive: true });

    writeFileSync(join(dir, '.env'), `# Taichu Configuration
TAICHU_PORT=3120
TAICHU_STORAGE=sqlite
TAICHU_DATA_DIR=./.taichu/data
TAICHU_JWT_SECRET=change-me-to-a-random-string
TAICHU_LOG_LEVEL=info
`);

    writeFileSync(join(dir, 'taichu.config.json'), JSON.stringify({
      siteName: 'My Taichu Site',
      language: 'zh-CN',
      timezone: 'Asia/Shanghai'
    }, null, 2));

    console.log(`
  ⚡ Taichu CMS initialized in ${dir}/

    To start:
      cd ${dir}
      npx taichu dev

    Or with Docker:
      docker run -p 3120:3120 -v $(pwd)/.taichu:/app/.taichu caludelaw/taichu
`);
    process.exit(0);
    break;
  }

  case 'dev': {
    // Find taichu server module
    const serverPath = join(import.meta.dirname || process.cwd(), '..', '..', 'packages', 'server', 'src', 'index.js');
    if (!existsSync(serverPath)) {
      console.error('Taichu server not found. Run from a Taichu project root.');
      process.exit(1);
    }
    const child = spawn('node', [serverPath], { stdio: 'inherit', env: { ...process.env, TAICHU_PORT: process.env.TAICHU_PORT || '3120' } });
    child.on('exit', (code) => process.exit(code));
    break;
  }

  case 'migrate':
    await import('./migrate.js');
    break;

  case 'plugin':
    await import('./plugin-cli.js');
    break;

  case 'restore':
    await import('./restore.js');
    break;

  default:
    console.log(`
  ⚡ Taichu CMS CLI

  Commands:
    npx taichu init [dir]     Create a new Taichu project
    npx taichu dev            Start development server
    npx taichu migrate        Import content (WP/Markdown)
    npx taichu plugin         Browse & install plugins
    npx taichu restore        Restore database from backup

  Environment:
    TAICHU_PORT=3120          Server port
    TAICHU_STORAGE=sqlite     Storage engine (memory/sqlite)
    TAICHU_AGENT_KEY          API key for MCP Agent
`);
}
