/**
 * WebSocket Server — 实时内容变更推送
 *
 * 零依赖，基于 Node.js 原生 WebSocket (RFC 6455)。
 *
 * 功能：
 *   - 频道订阅（按内容类型：article, page, * 等）
 *   - 事件广播（create/update/delete/publish）
 *   - 连接心跳（30s ping）
 *   - 客户端数量追踪
 *
 * 协议：
 *   Client → Server: { type: "subscribe", channel: "article" }
 *   Server → Client: { type: "content_change", event: "update", channel: "article", doc: {...} }
 */

import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const HEARTBEAT_INTERVAL = 30000;

export class WebSocketServer extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, WebSocket>} */
    this.clients = new Map();
    /** @type {Map<string, Set<string>>} channel → clientIds */
    this.subscriptions = new Map();
    this.heartbeatTimer = null;
    this.stats = { connected: 0, messagesReceived: 0, messagesSent: 0 };
  }

  /**
   * Attach WebSocket upgrade handler to an existing HTTP server.
   * @param {import('node:http').Server} httpServer
   */
  attach(httpServer) {
    httpServer.on('upgrade', (req, socket, head) => {
      if (req.headers['upgrade']?.toLowerCase() !== 'websocket') return;

      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }

      // Accept the WebSocket connection
      const acceptKey = createHash('sha1')
        .update(key + WS_GUID)
        .digest('base64');

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
      );

      const ws = new WebSocket(socket);
      const clientId = randomBytes(8).toString('hex');
      this.clients.set(clientId, ws);
      this.stats.connected++;

      this.emit('connect', clientId);

      ws.on('message', (data) => {
        this.stats.messagesReceived++;
        this._handleMessage(clientId, data);
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        this.stats.connected = this.clients.size;
        // Remove from all subscriptions
        for (const [, subs] of this.subscriptions) {
          subs.delete(clientId);
        }
        this.emit('disconnect', clientId);
      });

      ws.on('error', () => {
        ws.close();
      });
    });

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      for (const [, ws] of this.clients) {
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Broadcast a content change event to subscribers of a channel.
   * @param {string} channel — content type name or "*" for all
   * @param {string} event — "create" | "update" | "delete" | "publish" | "archive"
   * @param {object} payload
   */
  broadcast(channel, event, payload) {
    const channels = [channel, '*'];
    const sentTo = new Set();

    for (const ch of channels) {
      const subs = this.subscriptions.get(ch);
      if (!subs) continue;
      for (const clientId of subs) {
        if (sentTo.has(clientId)) continue;
        const ws = this.clients.get(clientId);
        if (!ws) continue;
        ws.send(JSON.stringify({
          type: 'content_change',
          channel,
          event,
          doc: payload,
          ts: new Date().toISOString()
        }));
        sentTo.add(clientId);
        this.stats.messagesSent++;
      }
    }
  }

  /**
   * Get current server stats.
   */
  getStats() {
    const channels = {};
    for (const [ch, subs] of this.subscriptions) {
      channels[ch] = subs.size;
    }
    return { ...this.stats, channels };
  }

  /** Close all connections */
  close() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const [, ws] of this.clients) {
      ws.close(1001, 'Server shutting down');
    }
  }

  _handleMessage(clientId, raw) {
    try {
      if (typeof raw !== 'string') return;
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'subscribe': {
          const channel = msg.channel || '*';
          if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, new Set());
          }
          this.subscriptions.get(channel).add(clientId);
          const ws = this.clients.get(clientId);
          if (ws) ws.send(JSON.stringify({ type: 'subscribed', channel }));
          break;
        }
        case 'unsubscribe': {
          const channel = msg.channel || '*';
          const subs = this.subscriptions.get(channel);
          if (subs) subs.delete(clientId);
          break;
        }
      }
    } catch { /* ignore malformed */ }
  }
}

// ── WebSocket Frame Protocol ───────────────────────────────

export class WebSocket {
  constructor(socket) {
    this.socket = socket;
    this._buffer = Buffer.alloc(0);
    this._closed = false;

    socket.on('data', (chunk) => {
      this._buffer = Buffer.concat([this._buffer, chunk]);
      this._parseFrames();
    });

    socket.on('close', () => {
      this._closed = true;
      this.emit('close');
    });

    socket.on('error', () => {
      this._closed = true;
      this.emit('error');
    });
  }

  _listeners = {};

  on(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  emit(ev, ...args) { (this._listeners[ev] || []).forEach(f => f(...args)); }

  send(data) {
    if (this._closed) return;
    try {
      const payload = Buffer.from(data);
      const frame = this._encodeFrame(payload, 0x1); // text frame
      this.socket.write(frame);
    } catch {}
  }

  ping() {
    if (this._closed) return;
    try {
      this.socket.write(this._encodeFrame(Buffer.alloc(0), 0x9));
    } catch {}
  }

  close(code = 1000, reason = '') {
    if (this._closed) return;
    try {
      const payload = Buffer.alloc(2 + reason.length);
      payload.writeUInt16BE(code, 0);
      payload.write(reason, 2);
      this.socket.write(this._encodeFrame(payload, 0x8));
      this.socket.end();
    } catch {}
    this._closed = true;
  }

  _parseFrames() {
    while (this._buffer.length >= 2) {
      const opcode = this._buffer[0] & 0x0f;
      const masked = (this._buffer[1] & 0x80) !== 0;
      let payloadLen = this._buffer[1] & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this._buffer.length < 4) return;
        payloadLen = this._buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this._buffer.length < 10) return;
        payloadLen = Number(this._buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (this._buffer.length < offset + maskLen + payloadLen) return;

      const payload = this._buffer.subarray(offset + maskLen, offset + maskLen + payloadLen);
      if (masked) {
        const mask = this._buffer.subarray(offset, offset + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      this._buffer = this._buffer.subarray(offset + maskLen + payloadLen);

      switch (opcode) {
        case 0x1: // text
          this.emit('message', payload.toString('utf-8'));
          break;
        case 0x8: // close
          this.close();
          break;
        case 0x9: // ping → pong
          if (!this._closed) this.socket.write(this._encodeFrame(payload, 0xA));
          break;
      }
    }
  }

  _encodeFrame(payload, opcode) {
    const len = payload.length;
    let header;

    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, payload]);
  }
}

// ── Singleton ──────────────────────────────────────────────

let _wss = null;

export function getWSS() {
  if (!_wss) _wss = new WebSocketServer();
  return _wss;
}

export function createWSS() {
  _wss = new WebSocketServer();
  return _wss;
}

export function _resetWSS() { _wss = null; }
