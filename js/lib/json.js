// JSON formatting with useful error locations. No DOM access.

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortDeep(value[k])]),
    );
  }
  return value;
}

const MAX_SCAN = 20000;

function lineColumn(text, index) {
  const lines = text.slice(0, index).split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function locate(text, message) {
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(message);
  if (pos) return lineColumn(text, Number(pos[1]));
  // Some messages only quote a snippet. Find the shortest prefix that already
  // fails for a reason other than "ran out of input".
  if (text.length > MAX_SCAN) return null;
  for (let end = 1; end <= text.length; end++) {
    try {
      JSON.parse(text.slice(0, end));
    } catch (e) {
      const m = /position (\d+)/.exec(e.message);
      const truncated = /end of JSON|Unterminated/i.test(e.message) || (m && Number(m[1]) >= end);
      if (!truncated) return lineColumn(text, m ? Number(m[1]) : end - 1);
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {{indent?: number|string, sortKeys?: boolean}} options indent 0 = minify
 * @returns {{ok: true, output: string} | {ok: false, error: string, line?: number, column?: number}}
 */
export function formatJson(text, { indent = 2, sortKeys = false } = {}) {
  if (text.trim() === '') return { ok: false, error: 'Nothing to format: input is empty.' };
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e.message, ...locate(text, e.message) };
  }
  if (sortKeys) value = sortDeep(value);
  return { ok: true, output: JSON.stringify(value, null, indent || undefined) };
}
