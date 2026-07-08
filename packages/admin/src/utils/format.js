/**
 * Shared utility functions for admin views.
 * @file browser context — alert, console, etc. are global
 */
/* global alert */

import { useI18n } from '../i18n.js';

/**
 * Format an ISO date string for display.
 * Uses the current i18n locale for date formatting.
 * @param {string|Date|null} d
 * @param {'full'|'date'} [mode='full'] — 'full' = datetime, 'date' = date only
 * @returns {string}
 */
export function fmtDate(d, mode = 'full') {
  if (!d) return '-';
  const { locale } = useI18n();
  const loc = locale.value === 'zh-CN' ? 'zh-CN' : locale.value === 'ja' ? 'ja-JP' : 'en-US';
  if (mode === 'date') {
    return new Date(d).toLocaleDateString(loc, { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return new Date(d).toLocaleString(loc);
}

/**
 * Status label — delegates to i18n for locale-aware display.
 * @param {string} s — status code
 * @returns {string}
 */
export function statusLabel(s) {
  const { statusLabel: sl } = useI18n();
  return sl(s);
}

/**
 * Show a user-facing error notification.
 * Uses alert() for now; can be upgraded to toast/notification later.
 * @param {string} action — the action that failed (i18n key or string)
 * @param {Error|string} err
 */
export function notifyError(action, err) {
  const msg = err?.message || String(err || '');
  alert(`${action}: ${msg}`);
}

/**
 * Show a user-facing success notification.
 * @param {string} msg — the success message
 */
export function notifySuccess(msg) {
  alert(msg);
}

/**
 * Truncate a string to maxLen with ellipsis.
 */
export function truncate(s, maxLen = 80) {
  const str = String(s || '');
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}
