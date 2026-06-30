/**
 * Webhook System — 内容变更事件推送
 *
 * 注册外部 URL，当内容变更时 POST 事件数据。
 *
 * 功能：
 *   - Webhook 注册/列表/删除 API
 *   - 事件过滤（按内容类型、操作类型）
 *   - HMAC-SHA256 签名验证
 *   - 指数退避重试（最多 3 次）
 *   - 投递日志
 */

import { createHmac, randomBytes } from 'node:crypto';
import { createLogger } from './logger.js';

const log = createLogger('webhook');

const MAX_RETRIES = parseInt(process.env.TAICHU_WEBHOOK_RETRIES) || 3;
const RETRY_BASE_MS = parseInt(process.env.TAICHU_WEBHOOK_RETRY_BASE_MS) || 1000; // 1s, 2s, 4s

class WebhookManager {
  constructor(store) {
    this.store = store;
    this.deliveryLog = [];
  }

  /**
   * Register a new webhook.
   * @param {{ url: string, events?: string[], types?: string[], secret?: string, label?: string }} opts
   * @returns {Promise<object>}
   */
  async register({ url, events = ['*'], types = ['*'], secret, label }) {
    const id = randomBytes(12).toString('hex');
    const webhook = {
      id, url, events, types,
      secret: secret || randomBytes(16).toString('hex'),
      label: label || url,
      active: true,
      createdAt: new Date().toISOString(),
      stats: { delivered: 0, failed: 0, lastDelivery: null }
    };

    const doc = await this.store.create({
      type: 'webhook',
      data: webhook,
      status: 'active'
    });

    log.info(`Webhook registered: ${label || url} (${id})`);
    return { id: doc.id, ...webhook };
  }

  /**
   * List all registered webhooks.
   */
  async list() {
    const docs = await this.store.list({ type: 'webhook' });
    return docs.map(d => ({ id: d.id, ...d.data }));
  }

  /**
   * Delete a webhook.
   */
  async remove(id) {
    await this.store.delete(id);
  }

  /**
   * Fire event to all matching webhooks (called by hook system).
   * @param {string} event — "create" | "update" | "delete" | "publish"
   * @param {object} payload — { id, type, data, status, ... }
   */
  async fire(event, payload) {
    const hooks = await this.list();
    const active = hooks.filter(h => h.active);
    if (active.length === 0) return;

    for (const wh of active) {
      if (!this._matches(wh, event, payload)) continue;
      await this._deliver(wh, event, payload);
    }
  }

  /** Check if webhook matches event + payload type */
  _matches(wh, event, payload) {
    const eventMatch = wh.events.includes('*') || wh.events.includes(event);
    const typeMatch = wh.types.includes('*') || wh.types.includes(payload.type);
    return eventMatch && typeMatch;
  }

  /** Deliver event with retry */
  async _deliver(wh, event, payload) {
    const deliveryId = randomBytes(6).toString('hex');
    const body = JSON.stringify({
      id: deliveryId,
      event,
      type: payload.type,
      timestamp: new Date().toISOString(),
      data: payload
    });

    const signature = createHmac('sha256', wh.secret)
      .update(body)
      .digest('hex');

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(wh.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Taichu-Webhook-Event': event,
            'X-Taichu-Webhook-Signature': `sha256=${signature}`,
            'X-Taichu-Webhook-Id': deliveryId
          },
          body,
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          this._logDelivery(wh.id, deliveryId, true, attempt);
          // Update stats
          const doc = await this.store.get(wh.id);
          if (doc) {
            doc.data.stats.delivered++;
            doc.data.stats.lastDelivery = new Date().toISOString();
            await this.store.update(wh.id, { data: doc.data });
          }
          return;
        }

        // Non-2xx response — retry if server error
        if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
        // 4xx — no retry
        this._logDelivery(wh.id, deliveryId, false, attempt, `HTTP ${res.status}`);
        break;

      } catch (err) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
          log.warn(`Webhook retry ${attempt}/${MAX_RETRIES} for ${wh.url}: ${err.message}`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          this._logDelivery(wh.id, deliveryId, false, attempt, err.message);
          const doc = await this.store.get(wh.id);
          if (doc) {
            doc.data.stats.failed++;
            await this.store.update(wh.id, { data: doc.data });
          }
        }
      }
    }
  }

  _logDelivery(webhookId, deliveryId, success, attempt, error) {
    const entry = {
      webhookId, deliveryId, success, attempt,
      timestamp: new Date().toISOString(),
      error: error || null
    };
    this.deliveryLog.push(entry);
    if (this.deliveryLog.length > 1000) this.deliveryLog.shift();

    if (!success) log.error(`Webhook delivery failed: ${webhookId} — ${error}`);
  }

  /** Get delivery log */
  getLog(limit = 50) {
    return this.deliveryLog.slice(-limit).reverse();
  }

  /** Get stats */
  getStats() {
    const recent = this.deliveryLog.slice(-100);
    const success = recent.filter(e => e.success).length;
    return { recent: recent.length, success, failed: recent.length - success };
  }
}

// ── Singleton ──────────────────────────────────────────────

let _wm = null;

export { WebhookManager };

export function getWebhookManager(store) {
  if (!_wm && store) _wm = new WebhookManager(store);
  return _wm;
}

export function _resetWm() { _wm = null; }
