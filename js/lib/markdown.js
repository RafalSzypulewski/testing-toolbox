// A deliberately small Markdown reader for the changelog: headings, paragraphs, bullet lists,
// `code`, **bold** and [links](url). It returns plain data (no HTML), so the page builds DOM
// nodes from it and nothing in the file can inject markup or scripts. No DOM access.

// a link address may contain one level of balanced parentheses: [x](https://en.wikipedia.org/wiki/Foo_(bar))
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

/** Links may be web addresses, page anchors or relative paths; never javascript: or data: */
export function isSafeUrl(url) {
  return /^(https?:\/\/|#|\.{0,2}\/)/i.test(url) || (!/^[a-z][a-z0-9+.-]*:/i.test(url) && url !== '');
}

/** @returns {{type: 'text'|'code'|'strong'|'link', text: string, href?: string}[]} */
export function parseInline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'strong', text: m[2] });
    else if (isSafeUrl(m[4])) out.push({ type: 'link', text: m[3], href: m[4] });
    else out.push({ type: 'text', text: m[3] }); // unsafe link: keep the words, drop the link
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** @returns {({type: 'heading', level: number, inlines: object[]} | {type: 'paragraph', inlines: object[]} | {type: 'list', items: object[][]})[]} */
export function parseMarkdown(source) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
    paragraph = [];
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s{0,3}[-*]\s+(.*)$/.exec(line);
    if (line.trim() === '') {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, inlines: parseInline(heading[2]) });
    } else if (bullet) {
      if (paragraph.length) flush();
      if (!list) {
        list = { type: 'list', items: [] };
        blocks.push(list);
      }
      list.items.push([bullet[1]]);
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1].push(line.trim()); // continuation of the previous bullet
    } else {
      list = null;
      paragraph.push(line.trim());
    }
  }
  flush();
  for (const b of blocks) if (b.type === 'list') b.items = b.items.map((parts) => parseInline(parts.join(' ')));
  return blocks;
}
