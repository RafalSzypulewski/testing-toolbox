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
| **Pairwise generator** | Parameters and values in, the smallest set of test cases covering every pair (or value, or triple) out; rules for impossible combinations, invalid values tested one at a time, independent coverage check, export as TSV/CSV/Markdown/Gherkin/JSON |
| **File generator** | Download files of an exact size (up to 100 MiB): txt, csv, json, valid PNG (several dimensions), valid PDF, zero-filled or random binary; optional size −1 / size / size +1 set for upload limit tests |
| **Boundary values** | Strings at min−1/min/max/max+1 length (letters, Polish, emoji, counter string; shows UTF-8 bytes), exact numeric limits for int8 to uint64 or any range and step, date range edges, leap and impossible dates, 32-bit epoch limits, daylight-saving gaps and repeats |
| **Text diff** | Compare two texts by line, word or character with inline highlights, ignore whitespace/case, collapse unchanged lines, copy as a unified diff (`patch`-compatible); load files to detect CRLF vs LF differences |
| **Text utilities** | 37 one-click operations: change case (incl. camel/snake/kebab), sort (natural, by length, by number, language-aware), remove or count duplicates, filter, number, join/split (e.g. SQL `IN` lists), trim, remove diacritics, convert line endings, extract emails/URLs/numbers; chain steps with "Use result as input" |
| **Regex tester** | JavaScript regex with live highlighting, capture groups, replace preview and ready-made patterns (email, URL, UUID, PESEL, NIP, ...) |

Generated identifiers pass the official checksum rules but are random: they do not belong to real people, companies or bank accounts.

## Versioning

The current version is shown at the top of every page and links to [CHANGELOG.md](CHANGELOG.md). It lives in
three places that must agree: `js/version.js` (what the page shows), `package.json` and the newest entry in
`CHANGELOG.md`. `npm test` fails if they differ, so a release is: bump all three, merge, done. A new tool or
feature raises the minor number (1.1.0), a fix the patch number (1.0.1), a breaking change the major number.

## Run locally

ES modules do not load from `file://`, so serve the folder:

```sh
npm run serve        # tiny static server -> http://localhost:4173 (set PORT to change it)
```

## Tests

```sh
npm test             # unit tests for all logic in js/lib (Node 22+, no dependencies)

npm ci                                  # once: installs Playwright
npx playwright install --with-deps chromium   # once: downloads the test browser
npm run e2e          # browser tests for every tool, started against the local server
```

The browser tests (`e2e/`) open each tool in Chromium and use it the way a person would: typing, clicking,
copying, downloading files, at desktop and 320 px phone width. Every test also fails on any console error or
uncaught exception. The list of tools comes from `js/registry.js`, so a new tool is automatically checked for
opening, its title and fitting a phone; add a `e2e/<tool>.spec.js` for what it does. Tests that check
downloaded PDF and PNG files with `pdfinfo` (poppler-utils) and `identify` (ImageMagick) are skipped if those
programs are not installed. Both suites run in GitHub Actions on every push and pull request.

## Accessibility

The goal is WCAG 2.2 level AA. What is checked automatically on every push:

- **axe-core** finds no violations on any page, in the light and dark theme, and after using each tool (tables, highlights and results only exist then)
- **keyboard use**: a skip link is the first Tab stop, focus moves to the new page after navigating, every control shows a visible focus indicator, and the Boundary values tabs follow the ARIA tabs pattern
- **layout**: no sideways scrolling at 320 px wide or with text enlarged to 200%, and wider letter and line spacing does not break it
- **colour**: `tests/contrast.test.js` reads `css/style.css` and fails if any text, text box border or focus ring falls below the WCAG contrast limits in either theme

These checks cannot replace listening to the page with a real screen reader (NVDA, VoiceOver) or trying it with voice control, which has not been done yet. If you find a barrier, please open an issue.

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
