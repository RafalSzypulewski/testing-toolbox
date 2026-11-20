import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { md5, digest, hmac, computeAll, findMatch, toHex, toBase64, ALGORITHMS } from '../js/lib/hash.js';

const enc = (s) => new TextEncoder().encode(s);
const FOX = 'The quick brown fox jumps over the lazy dog';

test('MD5 matches the RFC 1321 test vectors', () => {
  const vectors = {
    '': 'd41d8cd98f00b204e9800998ecf8427e',
    a: '0cc175b9c0f1b6a831c399e269772661',
    abc: '900150983cd24fb0d6963f7d28e17f72',
    'message digest': 'f96b697d7cb7938d525a2f31aaf161d0',
    'abcdefghijklmnopqrstuvwxyz': 'c3fcd3d76192e4007dfb496cca67e13b',
    [FOX]: '9e107d9d372bb6826bd81d3542a419d6',
  };
  for (const [input, expected] of Object.entries(vectors)) assert.equal(toHex(md5(enc(input))), expected, input);
  assert.equal(toHex(md5(enc('a'.repeat(1_000_000)))), '7707d6ae4e027c70eea2a935c2296f21');
});

test('MD5 agrees with node:crypto around every padding boundary', () => {
  for (let len = 0; len <= 200; len++) {
    const data = randomBytes(len);
    assert.equal(toHex(md5(data)), createHash('md5').update(data).digest('hex'), `length ${len}`);
  }
  const big = randomBytes(300_000);
  assert.equal(toHex(md5(big)), createHash('md5').update(big).digest('hex'));
});

test('SHA digests match known vectors', async () => {
  assert.equal(toHex(await digest('SHA-1', enc('abc'))), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(toHex(await digest('SHA-256', enc('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.ok(toHex(await digest('SHA-384', enc('abc'))).startsWith('cb00753f45a35e8b'));
  assert.ok(toHex(await digest('SHA-512', enc('abc'))).startsWith('ddaf35a193617aba'));
  await assert.rejects(() => digest('SHA-3', enc('x')), /Unsupported/);
});

test('HMAC matches published vectors', async () => {
  const key = enc('key');
  assert.equal(toHex(await hmac('MD5', key, enc(FOX))), '80070713463e7749b90c2dc24911e275');
  assert.equal(toHex(await hmac('SHA-1', key, enc(FOX))), 'de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9');
  assert.equal(toHex(await hmac('SHA-256', key, enc(FOX))), 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
});

test('HMAC agrees with node:crypto for every algorithm, including keys longer than the block size', async () => {
  const names = { MD5: 'md5', 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512' };
  for (const algo of ALGORITHMS) {
    for (const keyLen of [0, 5, 64, 65, 128, 129, 300]) {
      const key = randomBytes(keyLen);
      const data = randomBytes(77);
      assert.equal(toHex(await hmac(algo, key, data)), createHmac(names[algo], key).update(data).digest('hex'), `${algo} key ${keyLen}`);
    }
  }
});

test('computeAll returns every algorithm, hex and base64, and supports HMAC', async () => {
  const res = await computeAll(enc('abc'));
  assert.deepEqual(res.map((r) => r.algo), ALGORITHMS);
  const sha256 = res.find((r) => r.algo === 'SHA-256');
  assert.equal(sha256.hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256.base64, 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  const h = await computeAll(enc(FOX), { key: enc('key'), algorithms: ['SHA-256'] });
  assert.equal(h[0].hex, 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  assert.equal(toBase64(Uint8Array.from([0xfb, 0xff])), '+/8=');
});

test('findMatch recognises pasted checksums in common formats', async () => {
  const res = await computeAll(enc('abc'));
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.deepEqual(findMatch(sha256, res), ['SHA-256']);
  assert.deepEqual(findMatch(`  ${sha256.toUpperCase()}\n`, res), ['SHA-256']);
  assert.deepEqual(findMatch(`sha256: ${sha256}`, res), ['SHA-256']);
  assert.deepEqual(findMatch(`SHA256=${sha256.slice(0, 32)} ${sha256.slice(32)}`, res), ['SHA-256']);
  assert.deepEqual(findMatch('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=', res), ['SHA-256']);
  assert.deepEqual(findMatch('900150983cd24fb0d6963f7d28e17f72', res), ['MD5']);
  assert.deepEqual(findMatch('deadbeef', res), []);
  assert.deepEqual(findMatch('   ', res), []);
});
