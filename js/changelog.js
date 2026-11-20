// The in-app changelog page (#/changelog). It reads CHANGELOG.md from this same site, so it
// works without github.com, on any branch, and in private forks.
import { h } from './util.js';
import { parseMarkdown } from './lib/markdown.js';
import { VERSION, CHANGELOG_URL } from './version.js';

const external = (href) => /^https?:\/\//i.test(href);

function inlineNodes(inlines) {
  return inlines.map((i) => {
    if (i.type === 'code') return h('code', {}, i.text);
    if (i.type === 'strong') return h('strong', {}, i.text);
    if (i.type === 'link') return h('a', { href: i.href, ...(external(i.href) ? { target: '_blank', rel: 'noopener' } : {}) }, i.text);
    return i.text;
  });
}

/** Turns parsed Markdown into DOM nodes. The file's own top heading is skipped: the page has one. */
export function blockNodes(blocks) {
  return blocks.flatMap((b, index) => {
    if (b.type === 'heading') {
      if (b.level === 1 && index === 0) return [];
      const title = b.inlines.map((i) => i.text).join('');
      const current = title.startsWith(`${VERSION} `);
      return [h(b.level <= 2 ? 'h3' : 'h4', { class: current ? 'current-version' : null }, inlineNodes(b.inlines), current ? h('span', { class: 'pill' }, 'you are here') : null)];
    }
    if (b.type === 'list') return [h('ul', {}, b.items.map((item) => h('li', {}, inlineNodes(item))))];
    return [h('p', {}, inlineNodes(b.inlines))];
  });
}

/**
 * Fills `container`. If the visitor leaves before the file arrives, the container has already
 * been removed from the page, so a late result cannot appear anywhere else.
 */
export async function renderChangelog(container) {
  container.classList.add('changelog');
  container.append(
    h('p', { class: 'lead' }, `You are using version v${VERSION}. `, h('a', { href: CHANGELOG_URL, target: '_blank', rel: 'noopener' }, 'View on GitHub')),
    h('p', { class: 'muted' }, 'Loading…'),
  );
  try {
    const response = await fetch('CHANGELOG.md', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    container.lastElementChild.replaceWith(...blockNodes(parseMarkdown(await response.text())));
  } catch (err) {
    container.lastElementChild.replaceWith(
      h('p', { class: 'status error' }, `The changelog could not be loaded (${err.message}). `, h('a', { href: CHANGELOG_URL, target: '_blank', rel: 'noopener' }, 'Open it on GitHub')),
    );
  }
}
