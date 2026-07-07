/**
 * render-body 单元测试
 *
 * 覆盖 renderBody, renderNode, escHtml, escAttr, excerpt 五个导出函数。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderBody, renderNode, escHtml, escAttr, excerpt } from './render-body.js'

describe('render-body', () => {
  // ── escHtml ──────────────────────────────────────
  describe('escHtml', () => {
    it('should escape < > & "', () => {
      assert.equal(escHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    })
    it('should handle non-string input', () => {
      assert.equal(escHtml(123), '123')
      assert.equal(escHtml(null), 'null')
      assert.equal(escHtml(undefined), 'undefined')
    })
  })

  // ── escAttr ──────────────────────────────────────
  describe('escAttr', () => {
    it('should escape " and \'', () => {
      assert.ok(escAttr('a"b').includes('&quot;'))
      assert.ok(escAttr("a'b").includes('&#39;'))
    })
  })

  // ── renderNode ───────────────────────────────────
  describe('renderNode', () => {
    it('should return empty string for null/undefined', () => {
      assert.equal(renderNode(null), '')
      assert.equal(renderNode(undefined), '')
    })

    it('should render paragraph', () => {
      const node = { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }
      assert.equal(renderNode(node), '<p>Hello</p>')
    })

    it('should render heading with level', () => {
      const node = { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] }
      assert.equal(renderNode(node), '<h2>Title</h2>')
    })

    it('should default heading to h2 when no level', () => {
      const node = { type: 'heading', content: [{ type: 'text', text: 'Title' }] }
      assert.equal(renderNode(node), '<h2>Title</h2>')
    })

    it('should render bold text', () => {
      const node = {
        type: 'text',
        text: 'bold',
        marks: [{ type: 'bold' }]
      }
      assert.equal(renderNode(node), '<strong>bold</strong>')
    })

    it('should render italic text', () => {
      const node = {
        type: 'text',
        text: 'italic',
        marks: [{ type: 'italic' }]
      }
      assert.equal(renderNode(node), '<em>italic</em>')
    })

    it('should render code text', () => {
      const node = {
        type: 'text',
        text: 'code',
        marks: [{ type: 'code' }]
      }
      assert.equal(renderNode(node), '<code>code</code>')
    })

    it('should render strike text', () => {
      const node = {
        type: 'text',
        text: 'strike',
        marks: [{ type: 'strike' }]
      }
      assert.equal(renderNode(node), '<s>strike</s>')
    })

    it('should render link', () => {
      const node = {
        type: 'text',
        text: 'click',
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
      }
      const result = renderNode(node)
      assert.ok(result.includes('<a '))
      assert.ok(result.includes('href="https://example.com"'))
      assert.ok(result.includes('target="_blank"'))
      assert.ok(result.includes('>click</a>'))
    })

    it('should render link with default href when missing', () => {
      const node = {
        type: 'text',
        text: 'click',
        marks: [{ type: 'link' }]
      }
      const result = renderNode(node)
      assert.ok(result.includes('href="#'))
    })

    it('should render multiple marks on same text', () => {
      const node = {
        type: 'text',
        text: 'x',
        marks: [{ type: 'bold' }, { type: 'italic' }]
      }
      const result = renderNode(node)
      assert.ok(result.includes('<strong>'))
      assert.ok(result.includes('<em>'))
    })

    it('should render bulletList', () => {
      const node = {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] }]
      }
      assert.equal(renderNode(node), '<ul><li><p>Item 1</p></li></ul>')
    })

    it('should render orderedList', () => {
      const node = {
        type: 'orderedList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] }]
      }
      assert.equal(renderNode(node), '<ol><li><p>Item 1</p></li></ol>')
    })

    it('should render blockquote', () => {
      const node = {
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }]
      }
      assert.equal(renderNode(node), '<blockquote><p>Quote</p></blockquote>')
    })

    it('should render codeBlock', () => {
      const node = {
        type: 'codeBlock',
        content: [{ type: 'text', text: 'console.log(1)' }]
      }
      assert.equal(renderNode(node), '<pre><code>console.log(1)</code></pre>')
    })

    it('should render horizontalRule', () => {
      assert.equal(renderNode({ type: 'horizontalRule' }), '<hr>')
    })

    it('should render image', () => {
      const node = {
        type: 'image',
        attrs: { src: '/img/test.png', alt: 'Test' }
      }
      const result = renderNode(node)
      assert.ok(result.includes('src="/img/test.png"'))
      assert.ok(result.includes('alt="Test"'))
      assert.ok(result.includes('loading="lazy"'))
    })

    it('should escape HTML in text content', () => {
      const node = { type: 'text', text: '<script>alert(1)</script>' }
      const result = renderNode(node)
      assert.ok(!result.includes('<script>'))
      assert.ok(result.includes('&lt;script&gt;'))
    })
  })

  // ── renderBody ───────────────────────────────────
  describe('renderBody', () => {
    it('should return empty string for null/undefined/empty', () => {
      assert.equal(renderBody(null), '')
      assert.equal(renderBody(undefined), '')
      assert.equal(renderBody(''), '')
    })

    it('should wrap plain string in <p>', () => {
      const result = renderBody('Hello world')
      assert.equal(result, '<p>Hello world</p>')
    })

    it('should escape HTML in plain string', () => {
      const result = renderBody('<b>hi</b>')
      assert.ok(!result.includes('<b>'))
    })

    it('should render TipTap doc with content array', () => {
      const body = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
          { type: 'horizontalRule' },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] }
        ]
      }
      const result = renderBody(body)
      assert.ok(result.includes('<p>First paragraph</p>'))
      assert.ok(result.includes('<hr>'))
      assert.ok(result.includes('<p>Second paragraph</p>'))
    })

    it('should render nested content (blockquote + bold)', () => {
      const body = {
        type: 'doc',
        content: [{
          type: 'blockquote',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'noted', marks: [{ type: 'bold' }] }]
          }]
        }]
      }
      const result = renderBody(body)
      assert.ok(result.includes('<blockquote><p><strong>noted</strong></p></blockquote>'))
    })

    it('should handle legacy text property', () => {
      const result = renderBody({ text: 'legacy text' })
      assert.equal(result, '<p>legacy text</p>')
    })
  })

  // ── excerpt ──────────────────────────────────────
  describe('excerpt', () => {
    it('should return empty string for null/undefined', () => {
      assert.equal(excerpt(null), '')
      assert.equal(excerpt(undefined), '')
    })

    it('should strip HTML from string body', () => {
      const body = '<p>Hello <strong>world</strong></p><p>More text here that goes on for a while</p>'
      const result = excerpt(body, 20)
      // Approximate: "Hello worldMore text..." — stripping tags
      assert.ok(result.length <= 23) // 20 + '...'
    })

    it('should truncate to max length', () => {
      const result = excerpt('a'.repeat(300), 200)
      assert.equal(result.length, 203) // 200 + '...'
      assert.ok(result.endsWith('...'))
    })

    it('should extract text from doc content', () => {
      const body = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }
        ]
      }
      const result = excerpt(body, 200)
      assert.ok(result.includes('Hello world'))
    })

    it('should use default maxLen of 200', () => {
      const long = 'x'.repeat(300)
      const result = excerpt(long)
      assert.equal(result.length, 203)
    })
  })
})
