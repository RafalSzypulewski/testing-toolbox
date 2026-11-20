// Hashing and HMAC. SHA-* use the browser's Web Crypto; MD5 (not in Web Crypto)
// is implemented here because it is still widely used for file checksums.
// MD5 and SHA-1 are NOT secure; use them only to compare checksums. No DOM access.

export const ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
const BLOCK_SIZE = { MD5: 64, 'SHA-1': 64, 'SHA-256': 64, 'SHA-384': 128, 'SHA-512': 128 };

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ---- MD5 (RFC 1321) ------------------------------------------------------

const MD5_SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Uint32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));

export function md5(bytes) {
  const len = bytes.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (len * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(len / 0x20000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;
  const m = new Int32Array(16);

  for (let off = 0; off < padded.length; off += 64) {
    for (let j = 0; j < 16; j++) m[j] = view.getInt32(off + j * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f;
      let g;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + MD5_K[i] + m[g]) | 0;
      a = d;
      d = c;
      c = b;
      const s = MD5_SHIFTS[(i >> 4) * 4 + (i % 4)];
      b = (b + ((f << s) | (f >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => outView.setInt32(i * 4, w, true));
  return out;
}

// ---- digest / HMAC -------------------------------------------------------------

export async function digest(algo, bytes) {
  if (algo === 'MD5') return md5(bytes);
  if (!ALGORITHMS.includes(algo)) throw new Error(`Unsupported algorithm: ${algo}`);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto is unavailable. Open this page over HTTPS or on localhost.');
  return new Uint8Array(await subtle.digest(algo, bytes));
}

const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

/** HMAC (RFC 2104) built on `digest`, so it works for MD5 as well. */
export async function hmac(algo, key, data) {
  const block = BLOCK_SIZE[algo];
  if (!block) throw new Error(`Unsupported algorithm: ${algo}`);
  const k = key.length > block ? await digest(algo, key) : key;
  const ipad = new Uint8Array(block);
  const opad = new Uint8Array(block);
  for (let i = 0; i < block; i++) {
    const b = i < k.length ? k[i] : 0;
    ipad[i] = b ^ 0x36;
    opad[i] = b ^ 0x5c;
  }
  return digest(algo, concat(opad, await digest(algo, concat(ipad, data))));
}

/**
 * Hashes `bytes` with every algorithm. One failing algorithm does not stop the others.
 * @returns {Promise<({algo: string, hex: string, base64: string} | {algo: string, error: string})[]>}
 */
export async function computeAll(bytes, { key = null, algorithms = ALGORITHMS } = {}) {
  return Promise.all(
    algorithms.map(async (algo) => {
      try {
        const out = key === null ? await digest(algo, bytes) : await hmac(algo, key, bytes);
        return { algo, hex: toHex(out), base64: toBase64(out) };
      } catch (err) {
        return { algo, error: err.message };
      }
    }),
  );
}

/** Which algorithms produce the pasted checksum? Accepts hex (any case, spaces, "sha256:" prefix) or Base64. */
export function findMatch(expected, results) {
  const cleaned = expected.trim().replace(/^[a-z0-9-]+\s*[:=]\s*/i, '').replace(/\s+/g, '');
  if (!cleaned) return [];
  const asHex = cleaned.toLowerCase();
  return results.filter((r) => !r.error && (r.hex === asHex || r.base64 === cleaned)).map((r) => r.algo);
}
