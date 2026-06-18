/**
 * Health Check — 生产环境就绪检查
 *
 * 提供两个级别的健康检查：
 *   - liveness  (/health): 进程是否存活（总是 200）
 *   - readiness (/ready):   所有依赖是否就绪（store 连通性探测）
 */

/**
 * 活性检查 — 返回基本系统信息。
 * 不依赖任何外部服务，进程活着即返回 200。
 *
 * @param {object} config — { version, nodeEnv, storage }
 * @param {Function} getWSStats — WebSocket 统计函数
 * @returns {object} health status
 */
export function livenessCheck(config, getWSStats) {
  const mem = process.memoryUsage();
  return {
    status: 'ok',
    name: 'taichu',
    version: config.version,
    uptime: Math.floor(process.uptime()),
    node: process.version,
    env: config.nodeEnv,
    store: config.storage,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB'
    },
    ws: getWSStats ? getWSStats() : { connections: 0 },
    timestamp: new Date().toISOString()
  };
}

/**
 * 就绪检查 — 探测 store 连通性。
 * 存储不可用时返回 503，通知负载均衡器摘除该节点。
 *
 * @param {object} store — Store 实例
 * @param {object} opts   — 可选配置
 * @param {number} [opts.timeout=3000] — store 探测超时 (ms)
 * @returns {Promise<{ready: boolean, checks: object}>}
 */
export async function readinessCheck(store, opts = {}) {
  const timeout = opts.timeout || 3000;
  const checks = {};

  // Store connectivity probe
  try {
    const probe = Promise.race([
      store.count({}),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Store probe timed out')), timeout)
      )
    ]);
    await probe;
    checks.store = 'ok';
  } catch (err) {
    checks.store = `error: ${err.message}`;
  }

  const ready = Object.values(checks).every(v => v === 'ok');

  return {
    status: ready ? 'ready' : 'not_ready',
    name: 'taichu',
    checks,
    timestamp: new Date().toISOString()
  };
}
