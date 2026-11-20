// JWT decoding only. Signatures are NOT verified and nothing is sent anywhere.
import { base64Decode } from './text.js';

const TIME_CLAIMS = { exp: 'Expires', iat: 'Issued at', nbf: 'Not before' };

function decodePart(part, name) {
  try {
    return JSON.parse(base64Decode(part));
  } catch {
    throw new Error(`The ${name} is not valid Base64URL-encoded JSON.`);
  }
}

export function decodeJwt(input, now = Date.now()) {
  const token = input.trim().replace(/^bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length < 2 || parts.length > 3 || parts.some((p, i) => i < 2 && p === '')) {
    throw new Error('A JWT has 3 dot-separated parts: header.payload.signature');
  }
  const header = decodePart(parts[0], 'header');
  const payload = decodePart(parts[1], 'payload');

  const times = [];
  for (const [claim, label] of Object.entries(TIME_CLAIMS)) {
    const v = payload[claim];
    if (typeof v === 'number') times.push({ claim, label, seconds: v, iso: new Date(v * 1000).toISOString() });
  }

  let status = 'No expiry claim (exp) present.';
  const exp = times.find((t) => t.claim === 'exp');
  const nbf = times.find((t) => t.claim === 'nbf');
  if (exp && exp.seconds * 1000 <= now) status = 'Expired';
  else if (nbf && nbf.seconds * 1000 > now) status = 'Not valid yet';
  else if (exp) status = 'Not expired';

  return { header, payload, signature: parts[2] ?? '', times, status };
}
