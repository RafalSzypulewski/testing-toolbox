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

Generated identifiers pass the official checksum rules but are random: they do not belong to real people, companies or bank accounts.

## Run locally

ES modules do not load from `file://`, so serve the folder:

```sh
npm run serve        # python3 -m http.server 8080 -> http://localhost:8080
npm test             # unit tests (Node 20+, no dependencies)
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

## Ideas for later

Text diff, regex tester, hash calculator, file-of-size generator, boundary-value helper, colour contrast checker.

## Licence

MIT
