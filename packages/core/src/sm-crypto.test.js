/**
 * sm-crypto 单元测试
 *
 * 覆盖 sm3Hash, sm4Encrypt, sm2Sign, isSMEnabled 四个导出函数。
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sm3Hash, sm4Encrypt, sm2Sign, isSMEnabled } from './sm-crypto.js';

const SAVED_ENV = { ...process.env };

describe('sm-crypto', () => {
  beforeEach(() => {
    delete process.env.TAICHU_SM_CRYPTO;
  });

  afterEach(() => {
    process.env.TAICHU_SM_CRYPTO = SAVED_ENV.TAICHU_SM_CRYPTO;
    if (SAVED_ENV.TAICHU_SM_CRYPTO === undefined) {
      delete process.env.TAICHU_SM_CRYPTO;
    }
  });

  // --- sm3Hash ---
  describe('sm3Hash', () => {
    it('should produce a 64-char hex string (sha256 fallback)', () => {
      const result = sm3Hash('hello');
      assert.equal(typeof result, 'string');
      assert.equal(result.length, 64);
    });

    it('should be deterministic', () => {
      assert.equal(sm3Hash('test'), sm3Hash('test'));
    });

    it('should differ for different inputs', () => {
      assert.notEqual(sm3Hash('foo'), sm3Hash('bar'));
    });

    it('should handle empty string', () => {
      const result = sm3Hash('');
      assert.equal(result.length, 64);
    });

    it('should handle buffer input', () => {
      const result = sm3Hash(Buffer.from('data'));
      assert.equal(result.length, 64);
    });

    it('should fall through to sha256 even when SM is enabled (plugin not loaded)', () => {
      process.env.TAICHU_SM_CRYPTO = '1';
      const result = sm3Hash('test');
      assert.equal(result.length, 64);
    });
  });

  // --- sm4Encrypt ---
  describe('sm4Encrypt', () => {
    it('should wrap plaintext with aes-256-gcm when SM not enabled', () => {
      delete process.env.TAICHU_SM_CRYPTO;
      const result = sm4Encrypt('secret message');
      assert.deepEqual(result, { algorithm: 'aes-256-gcm', data: 'secret message' });
    });

    it('should pass through any plaintext value', () => {
      delete process.env.TAICHU_SM_CRYPTO;
      const result = sm4Encrypt(42);
      assert.deepEqual(result, { algorithm: 'aes-256-gcm', data: 42 });
    });

    it('should throw when SM crypto is enabled', () => {
      process.env.TAICHU_SM_CRYPTO = '1';
      assert.throws(() => sm4Encrypt('data'), {
        message: /SM4 requires/,
      });
    });
  });

  // --- sm2Sign ---
  describe('sm2Sign', () => {
    it('should always throw (plugin required)', () => {
      assert.throws(() => sm2Sign(), {
        message: /SM2 requires/,
      });
    });

    it('should throw even when SM is not enabled', () => {
      delete process.env.TAICHU_SM_CRYPTO;
      assert.throws(() => sm2Sign(), {
        message: /SM2 requires/,
      });
    });
  });

  // --- isSMEnabled ---
  describe('isSMEnabled', () => {
    it('should return false when env is unset', () => {
      delete process.env.TAICHU_SM_CRYPTO;
      assert.equal(isSMEnabled(), false);
    });

    it('should return true when TAICHU_SM_CRYPTO=1', () => {
      process.env.TAICHU_SM_CRYPTO = '1';
      assert.equal(isSMEnabled(), true);
    });

    it('should return false when TAICHU_SM_CRYPTO=0', () => {
      process.env.TAICHU_SM_CRYPTO = '0';
      assert.equal(isSMEnabled(), false);
    });

    it('should return false for any value other than "1"', () => {
      process.env.TAICHU_SM_CRYPTO = 'true';
      assert.equal(isSMEnabled(), false);
    });
  });
});
