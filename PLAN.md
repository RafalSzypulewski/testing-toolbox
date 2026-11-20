# Plan

Status as of 2026-11-20. Tick items off as they are done.

## Done

### Foundation
- [x] Public repo `testing-toolbox`, MIT licence
- [x] Static client-side app, no backend and no build step (plain HTML, CSS, ES modules)
- [x] Shell: sidebar grouped by category, tool search, hash routing (`#/tool-id`), light/dark theme, responsive layout
- [x] Tool registry (`js/registry.js`) and shared DOM helpers (`js/util.js`)
- [x] Pure logic separated from UI in `js/lib/`, covered by 23 `node:test` unit tests (`npm test`)
- [x] Browser check in Chromium: every tool exercised, no console errors, no horizontal scroll on mobile
- [x] README with tool list, local run instructions, Pages deployment and "add a tool" guide
- [x] First PR (#1) merged into `main`

### Tools (9)
| Tool | Category | Notes |
|---|---|---|
| Counter string | Generate | Ported from the WPF `StringGenerator` app; configurable marker |
| Random string | Generate | Ported from `StringGenerator`; random spaces and LF/CRLF line breaks; exact length guaranteed |
| Naughty strings | Generate | ~90 curated edge cases in 7 categories, filter, copy one or all |
| Test data (Poland) | Generate | PESEL (matches birth date and sex), NIP, REGON (9/14), IBAN PL, names, email, phone, address, UUID; JSON/CSV/TSV; validator |
| Text inspector | Inspect | Code points, UTF-16 units, UTF-8 bytes, graphemes, hidden-character view |
| JWT decoder | Inspect | Decode only, expiry status |
| JSON formatter | Convert | Format, minify, sort keys, error line and column |
| Encode / decode | Convert | Base64, Base64URL, URL, HTML entities, `\uXXXX` |
| Timestamp converter | Convert | Epoch seconds/ms and dates, several time zones, live clock |

## Next

### 1. Go live (do first)
- [ ] Enable GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `(root)`
- [ ] Open the live URL and smoke-test every tool on desktop and phone
- [ ] Add the live URL to the README and the repo "About" box

### 2. Quality and safety net
- [ ] GitHub Actions workflow that runs `npm test` on every push and PR
- [ ] Commit the Playwright smoke test (currently only run ad hoc) as an optional `npm run e2e`
- [ ] Accessibility pass: keyboard-only use, focus order, colour contrast in both themes
- [ ] Content-Security-Policy `<meta>` tag (the app loads no third-party scripts)

### 3. New tools, in suggested order
1. [ ] **Regex tester**: pattern and flags, live matches, capture groups, replace preview
2. [ ] **Hash calculator**: SHA-1/256/384/512 of text or a dropped file (Web Crypto), HMAC option
3. [ ] **Text diff**: two inputs, line and word diff, ignore-whitespace option
4. [ ] **Boundary values**: min/max for common numeric types, dates, and "string of length N±1" for field limits
5. [ ] **File-of-size generator**: downloadable files of an exact size (txt, csv, json, zero-filled) for upload tests
6. [ ] **Lorem ipsum / sentence generator**: paragraphs, sentences or words, English and Polish
7. [ ] **Text utilities**: change case, sort, dedupe, trim, join/split lines, line numbering
8. [ ] **Colour contrast checker**: WCAG AA/AAA ratio for two colours
9. [ ] **Date and time test cases**: leap days, DST changes, month ends, year 2038, in a copyable list
10. [ ] **More Polish identifiers**: ID card number (dowód osobisty), KRS, postal code and bank account (NRB) validators

### 4. Improvements to existing tools
- [ ] Counter string and Random string: remember the last-used settings per browser
- [ ] Naughty strings: add categories (file names, email and URL edge cases, date strings) and a "mark as used" tick
- [ ] Test data: seed option for reproducible data, address and company-name fields, copy a single record
- [ ] Share state in the URL (e.g. tool inputs in the hash) so a setup can be bookmarked or sent to a colleague
- [ ] Optional offline use as an installable PWA (service worker and manifest)
- [ ] Keyboard shortcuts: `/` focuses search, `Ctrl+Enter` runs the current tool

### 5. Possible later: a companion CLI
Browsers cannot make arbitrary network requests (CORS), so a port checker or HTTP request sender does not fit here. If these are needed, build them as a small separate Node or .NET command-line tool that can reuse the logic in `js/lib/`.

## Known limitations
- ES modules do not load from `file://`; run `npm run serve` or use the hosted site.
- The counter-string marker must be one UTF-16 character (no emoji).
- Output and generation are capped at 1,000,000 characters to keep the page responsive.
- Some clipboards normalise special characters (for example null bytes), so verify pasted values in the target system.
- The Polish identifiers are checksum-valid but random; phone numbers are random mobile numbers and may belong to real people, so do not use them to send messages.
- JWT decoding does not verify signatures.

## Out of scope
- Any backend, accounts or analytics. Everything stays client-side so test data and tokens never leave the machine.
- The original WPF `StringGenerator` app stays in the `tools` repo as is.
