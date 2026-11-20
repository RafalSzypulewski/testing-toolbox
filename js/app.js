import { tools } from './registry.js';
import { h } from './util.js';
import { renderChangelog } from './changelog.js';
import { VERSION } from './version.js';

const versionLink = document.getElementById('version');
versionLink.textContent = `v${VERSION}`;
versionLink.href = '#/changelog';

const nav = document.getElementById('nav');
const main = document.getElementById('main');
const search = document.getElementById('search');
let cleanup = null;

// ---- theme (stored only as a per-browser convenience) ------------------------
function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
try {
  applyTheme(localStorage.getItem('theme'));
} catch {
  /* storage unavailable: follow the system theme */
}
document.getElementById('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem('theme', next);
  } catch {
    /* ignore */
  }
});

// ---- sidebar --------------------------------------------------------------------
const currentId = () => location.hash.replace(/^#\/?/, '');

function matches(tool, q) {
  const hay = `${tool.name} ${tool.description} ${tool.category} ${(tool.keywords ?? []).join(' ')}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

function renderNav() {
  const q = search.value.trim().toLowerCase();
  const visible = tools.filter((t) => matches(t, q));
  nav.replaceChildren();
  if (visible.length === 0) {
    nav.append(h('div', { class: 'nav-empty' }, 'No matching tools'));
    return;
  }
  for (const category of [...new Set(visible.map((t) => t.category))]) {
    nav.append(h('div', { class: 'nav-group' }, category));
    for (const tool of visible.filter((t) => t.category === category)) {
      nav.append(h('a', { class: 'nav-link', href: `#/${tool.id}`, 'aria-current': tool.id === currentId() ? 'page' : null }, tool.name));
    }
  }
}

// ---- routing ----------------------------------------------------------------------
function renderHome() {
  main.append(
    h('h2', {}, 'Testing Toolbox'),
    h('p', { class: 'lead' }, 'Small tools for everyday testing. Everything runs in your browser; nothing you type is sent anywhere. ', h('a', { href: '#/changelog' }, `What's new in v${VERSION}`)),
    h(
      'div',
      { class: 'tool-grid' },
      tools.map((t) => h('a', { class: 'card tool-card', href: `#/${t.id}` }, h('strong', {}, t.name), h('span', {}, t.description))),
    ),
  );
}

function route() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  main.replaceChildren();
  const tool = tools.find((t) => t.id === currentId());
  if (currentId() === 'changelog') {
    document.title = 'Changelog · Testing Toolbox';
    main.append(h('h2', {}, 'Changelog'));
    const body = h('div');
    main.append(body);
    renderChangelog(body);
  } else if (tool) {
    document.title = `${tool.name} · Testing Toolbox`;
    main.append(h('h2', {}, tool.name), h('p', { class: 'lead' }, tool.description));
    const body = h('div');
    main.append(body);
    try {
      cleanup = tool.render(body) ?? null;
    } catch (err) {
      body.append(h('p', { class: 'status error' }, `This tool failed to load: ${err.message}`));
      console.error(err);
    }
  } else {
    document.title = 'Testing Toolbox';
    renderHome();
  }
  renderNav();
  window.scrollTo(0, 0);
}

search.addEventListener('input', renderNav);
window.addEventListener('hashchange', route);
route();
