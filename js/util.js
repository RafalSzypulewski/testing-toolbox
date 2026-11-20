// Small DOM helpers shared by all tools.

/** Hyperscript-style element builder: h('button', { class: 'primary', onclick }, 'Label') */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  if (tag === 'th' && !el.hasAttribute('scope')) el.setAttribute('scope', 'col'); // header cells name their column
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

/** Wraps a control with a label (and optional hint). */
export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('small', {}, hint) : null);
}

export function checkbox(label, checked = false, onchange) {
  const input = h('input', { type: 'checkbox', checked, onchange });
  return { input, el: h('label', { class: 'check' }, input, h('span', {}, label)) };
}

let toastTimer;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

export async function copyText(text, message = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers / contexts without the async clipboard API.
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) {
      toast('Copy failed: select the text and press Ctrl+C');
      return false;
    }
  }
  toast(message);
  return true;
}

/** Saves a Blob (keeping its own MIME type). */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadFile(filename, content, mime = 'text/plain') {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
}

/** One-line status area: ok(), error(), clear(). */
export function statusLine() {
  const el = h('p', { class: 'status', role: 'status' });
  const set = (cls, msg) => {
    el.className = `status ${cls}`;
    el.textContent = msg;
  };
  return { el, ok: (m) => set('ok', m), error: (m) => set('error', m), info: (m) => set('', m), clear: () => set('', '') };
}

/**
 * Read-only output box with Copy / Download buttons and a length counter.
 * The text box itself turns every line break into LF, so the exact text (for example with
 * CRLF) is kept separately and is what Copy, Download and get() return.
 */
export function outputPanel({ label = 'Result', filename = 'output.txt', rows = 8 } = {}) {
  let raw = '';
  const area = h('textarea', { readOnly: true, rows, spellcheck: false, 'aria-label': label });
  const count = h('span', { class: 'muted' });
  const copy = h('button', { 'aria-label': `Copy ${label.toLowerCase()}`, onclick: () => raw && copyText(raw) }, 'Copy');
  const save = h('button', { 'aria-label': `Download ${label.toLowerCase()}`, onclick: () => raw && downloadFile(filename, raw) }, 'Download');
  const el = h('div', { class: 'output' }, h('div', { class: 'output-bar' }, h('strong', {}, label), count, h('span', { class: 'spacer' }), copy, save), area);
  return {
    el,
    get: () => raw,
    set(text) {
      raw = text;
      area.value = text;
      count.textContent = text ? `${Array.from(text).length.toLocaleString('en-US')} characters` : '';
    },
  };
}

export function chips(values, onpick, format = String) {
  return h('div', { class: 'chips' }, values.map((v) => h('button', { class: 'chip', onclick: () => onpick(v) }, format(v))));
}
