// Text helpers: inspection, visualisation and encoding. No DOM access.

// Characters that are invisible or easy to confuse with something else.
const INVISIBLE = /[\u00a0\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202f\u2060-\u206f\u3000\ufeff]/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

/** Replace control / invisible characters with visible escapes like \n or \u{200b}. */
export function visualize(text) {
  let out = '';
  for (const ch of text) {
    if (ch === '\n') out += '\\n\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === ' ') out += ' ';
    else if (CONTROL.test(ch) || INVISIBLE.test(ch)) {
      out += `\\u{${ch.codePointAt(0).toString(16)}}`;
    } else out += ch;
  }
  return out;
}

export function utf8Bytes(text) {
  return new TextEncoder().encode(text);
}

export function inspect(text) {
  const codePoints = Array.from(text);
  const lineBreaks = {
    lf: (text.match(/(?<!\r)\n/g) ?? []).length,
    crlf: (text.match(/\r\n/g) ?? []).length,
    cr: (text.match(/\r(?!\n)/g) ?? []).length,
  };
  let graphemes = null;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
  }
  return {
    codePoints: codePoints.length,
    utf16Units: text.length,
    utf8Bytes: utf8Bytes(text).length,
    graphemes,
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
    words: (text.match(/\S+/g) ?? []).length,
    spaces: codePoints.filter((c) => c === ' ').length,
    nonAscii: codePoints.filter((c) => c.codePointAt(0) > 127).length,
    invisible: codePoints.filter((c) => INVISIBLE.test(c) || (CONTROL.test(c) && !'\n\r\t'.includes(c))).length,
    unique: new Set(codePoints).size,
    leadingTrailingSpace: text !== text.trim(),
    lineBreaks,
  };
}

// ---- Base64 -------------------------------------------------------------

export function base64Encode(text, { url = false } = {}) {
  const bytes = utf8Bytes(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  let out = btoa(binary);
  if (url) out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return out;
}

/** Decodes standard or URL-safe Base64 (padding optional) into UTF-8 text. */
export function base64Decode(input) {
  let s = input.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Not valid Base64 (unexpected characters).');
  while (s.length % 4 !== 0) s += '=';
  let binary;
  try {
    binary = atob(s);
  } catch {
    throw new Error('Not valid Base64.');
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Decoded bytes are not valid UTF-8 text.');
  }
}

// ---- URL / HTML / Unicode escapes ----------------------------------------

export const urlEncode = (text) => encodeURIComponent(text);

export function urlDecode(text) {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    throw new Error('Not valid percent-encoding.');
  }
}

export function htmlEscape(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

export function htmlUnescape(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body] ?? whole;
  });
}

/** Escapes every non-ASCII character as \uXXXX (surrogate pairs stay as two escapes). */
export function unicodeEscape(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out += code > 126 ? `\\u${code.toString(16).padStart(4, '0')}` : text[i];
  }
  return out;
}

export function unicodeUnescape(text) {
  return text.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, braced, plain) =>
    String.fromCodePoint(parseInt(braced ?? plain, 16)),
  );
}
