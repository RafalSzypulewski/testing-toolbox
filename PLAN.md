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
- [x] CI runs the unit tests on Node 22 and 24 (green on PR #3)
- [x] Version number shown on every page; a test keeps `js/version.js`, `package.json` and `CHANGELOG.md` in sync
- [x] In-app changelog page (`#/changelog`, 1.1.0): the version badge opens it, so it works without github.com; its Markdown reader never produces HTML or unsafe links
- [x] Browser tests checked by breaking the app on purpose (10 deliberate bugs: 9 caught, 1 turned out to be unnecessary code and was removed)
- [x] Layout checked at 320 px width on every tool (fixed overflow on Test data, Timestamp, Hash calculator, Text diff and Boundary values)
- [x] README with tool list, local run instructions, Pages deployment and "add a tool" guide
- [x] First PR (#1) merged into `main`

### Tools (16)
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
| Hash calculator | Convert | MD5 (own implementation), SHA-1/256/384/512 via Web Crypto, HMAC for all five, file hashing up to 100 MB, paste-a-checksum comparer |
| Text utilities | Convert | 37 operations in 4 groups (case, lines, clean-up, extract); live results, chaining, language-aware sorting, exact line endings preserved on Copy/Download |
| JSON toolkit | Convert | Tabs: JSONPath per RFC 9535 (checked against jq); JSON/CSV (checked against Python csv) and JSON/YAML (YAML 1.2 core subset, checked against PyYAML where the versions agree); semantic JSON diff with 4 array modes; JSONPath also on YAML input; JSON Schema validation (draft 2020-12 keywords, checked against Python jsonschema; all errors listed with path and rule). Limits: no `unevaluatedProperties`/`unevaluatedItems`/`$dynamicRef` and no `$ref` to other files (reported as warnings), no YAML tags beyond `!!str/int/float/bool/null`, JSONPath regex uses the browser engine, integers beyond 2^53 stay text |
| Pairwise generator | Generate | Seeded greedy covering-array search for strength 1, 2 or 3; rules (forbidden combinations, IF/THEN, alternatives, `<>`), invalid values tested alone, exclusion report, independent verifier; reaches the proven optimum on 4 of 9 benchmark shapes |
| File generator | Generate | Exact-size files up to 100 MiB: txt, csv, json (valid, padded), PNG (1x1 to 1920x1080) and PDF (valid, padded with legal filler), zeros, random; size ±1 mode; verified with ImageMagick, Pillow, poppler and pypdf |
| Boundary values | Generate | Length cases with expected accept/reject and UTF-8 byte counts; exact (BigInt) numeric limits incl. int64/uint64 and decimal steps; date range edges, 18 calendar edge cases, epoch limits, DST gaps/repeats for Europe and the USA (verified against the time zone database) |
| Text diff | Inspect | Myers diff by line/word/character, inline highlights, ignore whitespace/case, collapse to changes, unified-diff export (verified with `patch`), file loading to report CRLF/LF and final-newline differences |
| Regex tester | Inspect | Live highlighting, groups and named groups, replace preview, flags, 10 ready-made patterns incl. PESEL/NIP, 1,000-match cap |

## Next

### 1. Go live (do first)
- [ ] Enable GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `(root)`
- [ ] Open the live URL and smoke-test every tool on desktop and phone
- [ ] Add the live URL to the README and the repo "About" box

### 2. Quality and safety net
- [x] GitHub Actions workflow (`.github/workflows/test.yml`) runs `npm test` on Node 22 and 24 for every push to `main` and every PR
- [x] Playwright browser tests committed (`npm run e2e`, 283 tests in `e2e/`, including the accessibility ones) and run in CI next to the unit tests; every test fails on console errors; the tool list comes from the registry
- [x] Accessibility pass (1.2.0): skip link, focus handling, ARIA tabs, named buttons, table headers, visible control borders, relative font sizes, reduced motion; axe-core, keyboard, zoom and palette-contrast tests in CI
- [ ] Try the site with a real screen reader (NVDA on Windows, VoiceOver on Mac/iPhone) and with voice control; automated checks cannot judge how it sounds
- [ ] Update the GitHub Actions used in `.github/workflows/test.yml` (`checkout`, `setup-node`) to versions that run on Node 24; the CI log warns that the current ones target the deprecated Node 20
- [ ] Content-Security-Policy `<meta>` tag (the app loads no third-party scripts)

### 3. New tools, in suggested order
1. [x] **Regex tester**: pattern and flags, live matches, capture groups, replace preview
2. [x] **Hash calculator**: SHA-1/256/384/512 of text or a dropped file (Web Crypto), HMAC option (also MD5 and a checksum comparer)
3. [x] **Text diff**: two inputs, line and word diff, ignore-whitespace option (also character mode, unified-diff export and file loading)
4. [x] **Boundary values**: min/max for common numeric types, dates, and "string of length N±1" for field limits (also clock changes and epoch limits)
5. [x] **File-of-size generator**: downloadable files of an exact size (txt, csv, json, zero-filled) for upload tests (also PNG, PDF, random bytes and a size ±1 mode)
6. [ ] **Lorem ipsum / sentence generator**: paragraphs, sentences or words, English and Polish
7. [x] **Text utilities**: change case, sort, dedupe, trim, join/split lines, line numbering
8. [ ] **Colour contrast checker**: WCAG AA/AAA ratio for two colours
9. [x] **Date and time test cases**: leap days, DST changes, month ends, year 2038, in a copyable list (delivered inside Boundary values)
10. [ ] **More Polish identifiers**: ID card number (dowód osobisty), KRS, postal code and bank account (NRB) validators

### 4. Improvements to existing tools
- [ ] Pairwise generator: must-include seed cases (existing tests that count towards coverage), weights to prefer common values, import and export of the PICT model format, and a 4-way option for small inputs
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
- The pairwise generator uses a heuristic search: the number of cases is close to, but not guaranteed to be, the smallest possible (it is provably optimal when it equals the product of the two largest value counts). Inputs with more than 1,500,000 pairs are refused, and the independent coverage check is skipped above 60,000 pairs.
- The theme button shows only the symbol ◐ (it has the accessible name "Toggle theme"); axe lists it as "needs review" because it cannot compute contrast for a symbol. Its contrast was checked by hand (15 to 1).
- Text utilities sorting depends on the chosen language rules (default: your browser's); sorting 100,000 lines takes about 2 seconds. A text that starts with an empty line and has no final line break cannot be reversed back exactly, because a final line break is treated as the end of the last line (like Unix tools).
- The file generator is limited to 100 MiB (files are built in memory), cannot make a PNG that is 1 to 11 bytes larger than its minimum, and does not yet make JPEG, ZIP or Office files. Padded files compress extremely well; use random bytes to test upload speed.
- Browsers convert line breaks typed or pasted into a text box to LF, so CRLF vs LF differences can only be detected for text loaded from a file (Text diff offers this).

## Out of scope
- Any backend, accounts or analytics. Everything stays client-side so test data and tokens never leave the machine.
- The original WPF `StringGenerator` app stays in the `tools` repo as is.
