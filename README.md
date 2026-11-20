# Testing Toolbox

A collection of small browser-based tools for software testers. Everything runs **locally in your browser**: no backend, no analytics, nothing you type is sent anywhere.

## Tools

| Tool | What it does |
|---|---|
| **Counter string** | `*3*5*7*10*` strings where each marker shows its own position, to find exactly where a field truncates input |
| **Random string** | Random text from any character set, with optional random spaces and LF/CRLF line breaks |
| **Naughty strings** | ~90 click-to-copy edge cases: unicode, injection, big numbers, reserved words, long text |
| **Test data (Poland)** | Fake people with consistent PESEL, NIP, REGON and IBAN (valid checksums), JSON/CSV/TSV output, plus a validator |
| **Text inspector** | Characters vs UTF-16 units vs UTF-8 bytes vs graphemes, and a view that reveals invisible characters |
| **JWT decoder** | Header, payload, expiry status (decode only, no verification) |
| **JSON formatter** | Format, minify, sort keys; errors show line and column |
| **Encode / decode** | Base64, Base64URL, URL, HTML entities, `\uXXXX` escapes |
| **Timestamp converter** | Epoch seconds/ms and dates across time zones |
| **Hash calculator** | MD5, SHA-1/256/384/512 of text or a file (up to 100 MB), HMAC, and a checksum comparer that accepts hex or Base64 |
| **Boundary values** | Strings at min−1/min/max/max+1 length (letters, Polish, emoji, counter string; shows UTF-8 bytes), exact numeric limits for int8 to uint64 or any range and step, date range edges, leap and impossible dates, 32-bit epoch limits, daylight-saving gaps and repeats |
| **Text diff** | Compare two texts by line, word or character with inline highlights, ignore whitespace/case, collapse unchanged lines, copy as a unified diff (`patch`-compatible); load files to detect CRLF vs LF differences |
| **Regex tester** | JavaScript regex with live highlighting, capture groups, replace preview and ready-made patterns (email, URL, UUID, PESEL, NIP, ...) |

Generated identifiers pass the official checksum rules but are random: they do not belong to real people, companies or bank accounts.

## Run locally

ES modules do not load from `file://`, so serve the folder:

```sh
npm run serve        # python3 -m http.server 8080 -> http://localhost:8080
npm test             # unit tests (Node 22+, no dependencies)
```

## Deploy to GitHub Pages

1. Push to `main`.
2. Repository **Settings → Pages → Build and deployment**: Source *Deploy from a branch*, Branch `main`, folder `/ (root)`.
3. The site is served at `https://<user>.github.io/testing-toolbox/` after about a minute.

There is no build step. `.nojekyll` tells Pages to serve the files as they are.

## Add a tool

1. Put pure logic (no DOM) in `js/lib/yourTool.js` and test it in `tests/`.
2. Create `js/tools/yourTool.js` exporting a default object:

   ```js
   import { h, field, outputPanel } from '../util.js';
   export default {
     id: 'your-tool',               // used in the URL: #/your-tool
     name: 'Your tool',
     category: 'Convert',           // sidebar group
     description: 'One sentence.',
     keywords: ['search', 'terms'],
     render(root) { root.append(/* build the UI with h(...) */); },
   };
   ```
3. Import it and add it to the array in `js/registry.js`.

## Layout

```
index.html
css/style.css
js/app.js          shell: sidebar, search, routing, theme
js/registry.js     list of tools
js/util.js         DOM helpers (h, field, outputPanel, copyText, ...)
js/lib/            pure logic, unit-tested in Node
js/tools/          one UI module per tool
tests/             node:test unit tests
```

## Roadmap

See [PLAN.md](PLAN.md) for what is done and what is planned next.

## Licence

MIT
