# Changelog

All notable changes to Testing Toolbox. The version number is shown at the top of every page.
Format: `MAJOR.MINOR.PATCH`: a new tool or feature raises the minor number, a fix raises the patch
number, and a breaking change raises the major number.

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
