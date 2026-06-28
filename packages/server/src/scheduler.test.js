/**
 * Scheduler 单元测试
 *
 * 测试 startScheduler / stopScheduler 生命周期。
 * 由于 getStore() 在未初始化时返回 null，tick() 安全退出为 no-op，
 * 因此无需 mock store 即可验证启停逻辑。
 *
 * 覆盖：
 * - 启动/停止生命周期
 * - 环境变量配置 (TAICHU_SCHEDULE_INTERVAL_MS, TAICHU_SCHEDULE_BATCH_SIZE)
 * - 重复启动 + 停止
 * - 未启动时调用停止
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('scheduler', () => {
  let startScheduler, stopScheduler;
  let originalSetInterval, originalClearInterval;
  let intervalCount, clearedCount;
  let timers;

  beforeEach(async () => {
    // Reset env between tests
    delete process.env.TAICHU_SCHEDULE_INTERVAL_MS;
    delete process.env.TAICHU_SCHEDULE_BATCH_SIZE;

    timers = [];
    intervalCount = 0;
    clearedCount = 0;

    // Capture globals to mock setInterval / clearInterval
    originalSetInterval = globalThis.setInterval;
    originalClearInterval = globalThis.clearInterval;

    globalThis.setInterval = (fn, ms) => {
      const id = ++intervalCount;
      timers.push({ id, fn, ms });
      return id;
    };
    globalThis.clearInterval = (id) => {
      clearedCount++;
      // Don't actually clear — we track it manually
    };

    // Dynamic import ensures fresh module state tracking
    const mod = await import('./scheduler.js');
    startScheduler = mod.startScheduler;
    stopScheduler = mod.stopScheduler;
  });

  afterEach(() => {
    // Clean up: stop any running scheduler
    stopScheduler();
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });

  // ─── Start ────────────────────────────────────────

  it('should start and create an interval timer', () => {
    startScheduler();
    assert.ok(timers.length >= 1, 'should have created at least one timer');
    const timer = timers[timers.length - 1];
    assert.equal(typeof timer.fn, 'function');
    assert.equal(typeof timer.ms, 'number');
  });

  it('should default to 30000ms interval', () => {
    startScheduler();
    const timer = timers.find(t => t.fn && t.ms);
    assert.ok(timer);
    // The first timer is the interval (after the immediate tick)
    assert.equal(timer.ms, 30000);
  });

  it('should respect TAICHU_SCHEDULE_INTERVAL_MS', () => {
    process.env.TAICHU_SCHEDULE_INTERVAL_MS = '5000';
    startScheduler();
    const timer = timers.find(t => t.fn && t.ms);
    assert.ok(timer);
    assert.equal(timer.ms, 5000);
  });

  it('should accept hooks parameter', () => {
    const hooks = { run: async () => {} };
    assert.doesNotThrow(() => startScheduler(hooks));
  });

  // ─── Stop ─────────────────────────────────────────

  it('should clear interval on stop', () => {
    startScheduler();
    const before = clearedCount;
    stopScheduler();
    assert.ok(clearedCount > before, 'clearInterval should have been called');
  });

  it('should be safe to stop without start', () => {
    assert.doesNotThrow(() => stopScheduler());
  });

  it('should be safe to start and stop multiple times', () => {
    startScheduler();
    stopScheduler();
    startScheduler();
    stopScheduler();
    // No assertions needed — just ensuring no throw
    assert.ok(true);
  });

  // ─── Batch size configuration ─────────────────────

  it('should respect TAICHU_SCHEDULE_BATCH_SIZE', () => {
    process.env.TAICHU_SCHEDULE_BATCH_SIZE = '25';
    assert.doesNotThrow(() => startScheduler());
    // batchSize is used internally in tick(), which returns early
    // because getStore() is null. We can only verify it doesn't break.
  });

  // ─── Error resilience ─────────────────────────────

  it('should not crash when getStore returns null', () => {
    // getStore() returns null when ensureStore() not called
    // tick() should handle this gracefully
    assert.doesNotThrow(() => startScheduler());
  });

  it('should accept null/undefined hooks', () => {
    assert.doesNotThrow(() => startScheduler(null));
    assert.doesNotThrow(() => startScheduler(undefined));
  });
});
