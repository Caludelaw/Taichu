/**
 * render-body — TipTap JSON (ProseMirror doc) → HTML renderer
 *
 * Ported from the default theme renderer (public/theme/index.html).
 * Zero dependencies, pure function. Used by admin Content Preview panel.
 *
 * Supports: paragraph, heading (1-3), bulletList, orderedList, listItem,
 *           blockquote, codeBlock, horizontalRule, image, text with marks
 * Marks: bold, italic, code, link, strike
 *
 * @module render-body
 */

/**
 * Escape HTML special characters in text content.
 * @param {string} s
 * @returns {string}
 */
export function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Escape attribute values (for href, alt, src, etc.).
 * @param {string} s
 * @returns {string}
 */
export function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Render a single ProseMirror node to HTML string (recursive).
 * @param {object} node
 * @returns {string}
 */
export function renderNode(node) {
  if (!node) return ''

  let text = ''
  if (node.content && Array.isArray(node.content)) {
    text = node.content.map(renderNode).join('')
  } else if (node.text != null) {
    text = escHtml(String(node.text))
  }

  // Apply marks (bold, italic, code, link, strike)
  if (node.marks && Array.isArray(node.marks)) {
    node.marks.forEach(function (m) {
      if (m.type === 'bold') text = '<strong>' + text + '</strong>'
      if (m.type === 'italic') text = '<em>' + text + '</em>'
      if (m.type === 'code') text = '<code>' + text + '</code>'
      if (m.type === 'link') text = '<a href="' + escAttr(m.attrs?.href || '#') + '" target="_blank" rel="noopener">' + text + '</a>'
      if (m.type === 'strike') text = '<s>' + text + '</s>'
    })
  }

  switch (node.type) {
    case 'doc':
      return text
    case 'paragraph':
      return '<p>' + text + '</p>'
    case 'heading':
      return '<h' + (node.attrs?.level || 2) + '>' + text + '</h' + (node.attrs?.level || 2) + '>'
    case 'bulletList':
      return '<ul>' + text + '</ul>'
    case 'orderedList':
      return '<ol>' + text + '</ol>'
    case 'listItem':
      return '<li>' + text + '</li>'
    case 'blockquote':
      return '<blockquote>' + text + '</blockquote>'
    case 'codeBlock':
      return '<pre><code>' + text + '</code></pre>'
    case 'horizontalRule':
      return '<hr>'
    case 'image':
      return '<img src="' + escAttr(node.attrs?.src || '') + '" alt="' + escAttr(node.attrs?.alt || '') + '" loading="lazy">'
    default:
      return text
  }
}

/**
 * Render a TipTap JSON body to HTML string.
 *
 * Handles:
 * - null/undefined/empty → ''
 * - Plain string → escaped <p> wrapper
 * - ProseMirror doc object with content array → full render
 * - Legacy object with .text property
 *
 * @param {object|string|null} body — TipTap JSON document or plain text
 * @returns {string} HTML string safe for innerHTML
 */
export function renderBody(body) {
  if (!body) return ''
  if (typeof body === 'string') return '<p>' + escHtml(body) + '</p>'
  if (body.type === 'doc' && Array.isArray(body.content)) {
    return body.content.map(renderNode).join('')
  }
  if (body.text != null) return '<p>' + escHtml(String(body.text || body)) + '</p>'
  return ''
}

/**
 * Extract plain-text excerpt from body for preview summary.
 * @param {object|string|null} body
 * @param {number} [maxLen=200]
 * @returns {string}
 */
export function excerpt(body, maxLen) {
  const limit = maxLen || 200
  if (!body) return ''
  if (typeof body === 'string') {
    const t = body.replace(/<[^>]+>/g, '')
    return t.length > limit ? t.substring(0, limit) + '...' : t
  }
  if (body.text != null) {
    const s = escHtml(String(body.text))
    return s.length > limit ? s.substring(0, limit) + '...' : s
  }
  if (body.content && Array.isArray(body.content)) {
    const parts = []
    function collect(n) {
      if (!n) return
      if (n.text != null) parts.push(String(n.text))
      if (n.content) n.content.forEach(collect)
    }
    body.content.forEach(collect)
    const txt = parts.join(' ')
    return txt.length > limit ? txt.substring(0, limit) + '...' : txt
  }
  return ''
}
