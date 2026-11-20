import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMarkdown, parseInline, isSafeUrl } from '../js/lib/markdown.js';

const text = (inlines) => inlines.map((i) => i.text).join('');

test('inline: code, bold, links and plain text', () => {
  assert.deepEqual(parseInline('a `b` **c** [d](#/e) f'), [
    { type: 'text', text: 'a ' }, { type: 'code', text: 'b' }, { type: 'text', text: ' ' },
    { type: 'strong', text: 'c' }, { type: 'text', text: ' ' }, { type: 'link', text: 'd', href: '#/e' }, { type: 'text', text: ' f' },
  ]);
  assert.deepEqual(parseInline('plain'), [{ type: 'text', text: 'plain' }]);
  assert.deepEqual(parseInline(''), []);
});

test('links: only web, anchor and relative addresses survive', () => {
  for (const ok of ['https://example.com/a?b=1', 'http://x.org', '#/changelog', './CHANGELOG.md', '../x', '/abs', 'CHANGELOG.md']) assert.equal(isSafeUrl(ok), true, ok);
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///etc/passwd', '']) assert.equal(isSafeUrl(bad), false, bad);
  assert.deepEqual(parseInline('[click](javascript:alert(1))'), [{ type: 'text', text: 'click' }]);
  assert.ok(!JSON.stringify(parseInline('[x](data:text/html,hi)')).includes('data:'));
  assert.deepEqual(parseInline('[w](https://en.wikipedia.org/wiki/Foo_(bar))'), [{ type: 'link', text: 'w', href: 'https://en.wikipedia.org/wiki/Foo_(bar)' }]);
});

test('markup characters stay plain text: no HTML is ever produced', () => {
  const html = '<img src=x onerror=alert(1)> <script>alert(1)</script>';
  assert.deepEqual(parseInline(html), [{ type: 'text', text: html }]);
  assert.deepEqual(parseMarkdown(`# ${html}`)[0].inlines, [{ type: 'text', text: html }]);
});

test('blocks: headings, paragraphs and lists', () => {
  const blocks = parseMarkdown('# Title\n\nFirst line\nsecond line.\n\n## 1.0.0 - 2026-11-20\n\n- one `a`\n- two\n  continued\n* three\n\nAfter list.\n');
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'paragraph', 'heading', 'list', 'paragraph']);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[2].level, 2);
  assert.equal(text(blocks[1].inlines), 'First line second line.');
  assert.deepEqual(blocks[3].items.map(text), ['one a', 'two continued', 'three']);
  assert.equal(text(blocks[4].inlines), 'After list.');
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown('\n\n  \n'), []);
});

test('CRLF files and a list directly after a paragraph', () => {
  assert.deepEqual(parseMarkdown('# A\r\n\r\n- x\r\n- y\r\n').map((b) => b.type), ['heading', 'list']);
  assert.deepEqual(parseMarkdown('intro\n- x').map((b) => b.type), ['paragraph', 'list']);
});

test('the real CHANGELOG.md parses into version headings and lists', () => {
  const blocks = parseMarkdown(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  assert.equal(blocks[0].type, 'heading');
  assert.equal(text(blocks[0].inlines), 'Changelog');
  const versions = blocks.filter((b) => b.type === 'heading' && b.level === 2).map((b) => text(b.inlines));
  assert.ok(versions.length >= 1);
  versions.forEach((v) => assert.match(v, /^\d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/));
  assert.ok(blocks.some((b) => b.type === 'list' && b.items.length >= 2));
});
