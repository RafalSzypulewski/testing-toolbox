import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION, REPO_URL, CHANGELOG_URL } from '../js/version.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SEMVER = /^\d+\.\d+\.\d+$/;

test('the version is valid semver', () => {
  assert.match(VERSION, SEMVER);
});

test('js/version.js, package.json and CHANGELOG.md all agree', () => {
  const pkg = JSON.parse(read('package.json')).version;
  const changelog = /^## (\d+\.\d+\.\d+) - \d{4}-\d{2}-\d{2}$/m.exec(read('CHANGELOG.md'));
  assert.ok(changelog, 'CHANGELOG.md needs a top entry like "## 1.0.0 - 2026-11-20"');
  assert.equal(pkg, VERSION, 'package.json version differs from js/version.js');
  assert.equal(changelog[1], VERSION, 'newest CHANGELOG.md entry differs from js/version.js');
});

test('changelog versions are listed newest first and never repeat', () => {
  const versions = [...read('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+) - /gm)].map((m) => m[1].split('.').map(Number));
  const key = (v) => v[0] * 1e12 + v[1] * 1e6 + v[2];
  versions.forEach((v, i) => i && assert.ok(key(versions[i - 1]) > key(v), `entry ${v.join('.')} is not older than the one above it`));
});

test('links point at this repository', () => {
  assert.equal(REPO_URL, 'https://github.com/RafalSzypulewski/testing-toolbox');
  assert.equal(CHANGELOG_URL, `${REPO_URL}/blob/main/CHANGELOG.md`);
});
