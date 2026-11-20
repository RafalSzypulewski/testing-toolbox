# Changelog

All notable changes to Testing Toolbox. The version number is shown at the top of every page.
Format: `MAJOR.MINOR.PATCH`: a new tool or feature raises the minor number, a fix raises the patch
number, and a breaking change raises the major number.

## 1.4.0 - 2026-11-20

- Added the JSON toolkit with three tabs
- Query: search JSON with JSONPath (RFC 9535) including filters, slices, `..` and functions; every match is shown with its normalized path, and an error tells you where the query is wrong
- Convert: JSON to CSV and back, JSON to YAML and back; nested objects can become dotted columns and be rebuilt again; a YAML text with several documents becomes an array; whole numbers too large to keep exactly are kept as text with a warning
- Compare: compare two JSON documents by meaning (field order never matters); arrays can be matched by best alignment, by position, in any order or by an identifying field; ignore paths, allow a number tolerance, ignore case or spaces, treat null as missing
- The tabs now come from one shared component used by Boundary values and the JSON toolkit

## 1.3.0 - 2026-11-20

- Added the Pairwise generator: describe parameters and their values and get the smallest set of test cases that still covers every pair of values (or every value, or every triple)
- Rules for combinations that cannot happen, for example `IF OS = iOS THEN Browser = Safari`; the tool tells you which pairs your rules exclude, so a typo in a rule shows up
- Values marked with `!` are invalid: each is tested alone, once, with valid values everywhere else
- The same input always gives the same cases; "Try another arrangement" gives another valid set
- Coverage is re-checked independently after every run, and the result can be copied or downloaded as spreadsheet text, CSV, Markdown, a Gherkin examples table or JSON
- The download file name of result boxes now follows the chosen format

## 1.2.0 - 2026-11-20

Accessibility pass, measured against WCAG 2.2 level AA:

- Added a "Skip to the tool" link as the first Tab stop, and focus now moves to the new page after you navigate, so keyboard and screen-reader users start at the content
- The site title is now the page's main heading, and the tool list is announced as named groups (Generate, Inspect, Convert)
- The tabs in Boundary values follow the standard tabs pattern: arrow keys, Home and End move between them, and values you typed are kept when you switch tabs
- Every Copy and Download button in a table or result box has a name that says what it copies (for example "Copy SHA-256 hash"); table column headers are properly marked and none is empty
- The category dropdown in Naughty strings now has a label
- Text boxes and menus now have borders you can see (contrast was 1.3 to 1.5 to 1; it is now above 3.5 to 1), and the grey secondary text is slightly darker in the light theme so the +, - and ~ markers in Text diff meet the 4.5 to 1 text rule
- Text sizes now follow the browser's own text-size setting, and animations are switched off for people who ask for reduced motion
- Added automated accessibility tests: axe-core on every page in both themes and in 19 busy states, keyboard tests (skip link, focus order, visible focus on every control, tabs), 200% text size and text-spacing tests, and a test that keeps the colour palette above the WCAG contrast limits

## 1.1.0 - 2026-11-20

- Added an in-app changelog page (`#/changelog`). The version badge in the header opens it instead of linking to GitHub, so it works on networks that block github.com and before a branch is merged. The GitHub link stays on that page as a secondary option
- Added browser tests (Playwright) for every tool and the shell, run in CI on every push and pull request

## 1.0.0 - 2026-11-20

First versioned release. 15 tools, all running locally in the browser:

- Generate: Counter string, Random string, Naughty strings, Test data (Poland), Boundary values, File generator
- Inspect: Text inspector, JWT decoder, Regex tester, Text diff
- Convert: JSON formatter, Encode / decode, Timestamp converter, Hash calculator, Text utilities
- Version number shown in the page header, linking to this file
- Unit tests run on Node 22 and 24 for every push and pull request
