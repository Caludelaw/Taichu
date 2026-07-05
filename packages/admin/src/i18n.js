/**
 * i18n — 轻量国际化（零依赖）
 *
 * 支持：zh-CN / en / ja
 * 使用：$t('nav.dashboard') → 'Dashboard'
 * 模板：$t('contentList.selected_count', { n: 5 }) → '5 selected'
 *
 * 语言检测优先级：
 *   1. localStorage 'taichu_lang'
 *   2. TAICHU_LANG 环境变量（通过 window.__TAICHU_LANG__ 注入）
 *   3. 浏览器 navigator.language
 *   4. 默认 'en'
 */

import { ref } from 'vue';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import ja from './locales/ja.json';

const messages = { en, 'zh-CN': zhCN, ja };

const LOCALE_MAP = {
  'zh': 'zh-CN', 'zh-cn': 'zh-CN', 'zh-hans': 'zh-CN', 'zh-hant': 'zh-CN',
  'ja': 'ja', 'jp': 'ja',
  'en': 'en', 'en-us': 'en', 'en-gb': 'en'
};

const SUPPORTED = [
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { code: 'en',    label: 'English', flag: '🇺🇸' },
  { code: 'ja',    label: '日本語', flag: '🇯🇵' }
];

function detectLang() {
  try {
    const stored = localStorage.getItem('taichu_lang');
    if (stored && messages[stored]) return stored;
  } catch { /* localStorage not available */ }
  if (typeof window !== 'undefined' && window.__TAICHU_LANG__ && messages[window.__TAICHU_LANG__]) return window.__TAICHU_LANG__;
  if (typeof navigator !== 'undefined') {
    const browser = navigator.language?.toLowerCase();
    const mapped = LOCALE_MAP[browser];
    if (mapped && messages[mapped]) return mapped;
    if (browser?.startsWith('zh')) return 'zh-CN';
    if (browser?.startsWith('ja')) return 'ja';
  }
  return 'en';
}

const currentLocale = ref(detectLang());

/**
 * Translate a key path with optional template variables.
 * @param {string} key — dot-separated key path, e.g. 'nav.dashboard'
 * @param {object} [vars] — template variables, e.g. { n: 5 }
 * @returns {string}
 */
function t(key, vars) {
  const locale = currentLocale.value;
  const msg = messages[locale] || messages.en;
  let result = key.split('.').reduce((o, k) => (o || {})[k], msg);
  if (!result) return key;

  // Template variable replacement: {name} → value
  if (vars && typeof result === 'string') {
    result = result.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
  }
  return result;
}

function setLocale(code) {
  if (messages[code]) {
    currentLocale.value = code;
    try { localStorage.setItem('taichu_lang', code); } catch {}
  }
}

/**
 * Status label lookup — i18n-aware.
 * @param {string} s — status code (published, draft, etc.)
 * @returns {string}
 */
function statusLabel(s) {
  const keyMap = {
    published: 'common.status_published',
    draft: 'common.status_draft',
    scheduled: 'common.status_scheduled',
    archived: 'common.status_archived',
    active: 'common.status_active',
    revoked: 'common.status_revoked',
    pending: 'common.status_pending',
    rejected: 'common.status_rejected'
  };
  const key = keyMap[s];
  return key ? t(key) : (s || '-');
}

export function useI18n() {
  return { t, locale: currentLocale, setLocale, supportedLocales: SUPPORTED, statusLabel };
}
