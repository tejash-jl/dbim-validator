# Contributing to DBIM Validator

Thanks for helping make government websites more consistent and accessible. The most useful contributions are:

- **False-positive and false-negative reports** from real government websites. Use the [false positive template](https://github.com/tejash-jl/dbim-validator/issues/new?template=false-positive.yml) and include the URL, the check and what the page actually does.
- **Text patterns in Hindi and regional languages** for navigation labels, footer links, cookie banners and the lineage statement (see `src/lib/dbim/spec.ts`).
- **New or improved checks** for DBIM items that are still manual or heuristic.

## Development setup

```bash
npm install
npx playwright install chromium
npm run dev        # web app on :3000 plus the scan worker
```

Before opening a pull request, run:

```bash
npm run typecheck
npm run lint
npm test
```

## Adding or changing a check

1. Find the chapter module in `src/lib/dbim/rules/` (for example `colours.ts` or `typography.ts`).
2. Add a `Rule` with:
   - `section`: the DBIM section it comes from (for example `"4.3"`)
   - `checklist`: the Annexure F item, if there is one (for example `"F.1 #12"`)
   - `severity`: `critical`, `major` or `minor`
   - `source`: `automated`, `heuristic`, `ai` or `manual`
   - `appliesTo`: organization types, if it doesn't apply to all
3. Put values from the manual (colours, sizes, limits, text patterns) in `src/lib/dbim/spec.ts`, not in the rule.
4. If the rule needs data the scanner doesn't collect yet, add it to `PageData` in `src/lib/dbim/types.ts` and collect it in `src/lib/scanner/inpage.js` (runs in the page) or `src/lib/scanner/collect.ts`.
5. Add a test in `tests/rules.test.ts` and regenerate the check list with `npm run docs:checks`.

Every result should say what was found, cite evidence a web team can locate (page, selector, value) and give a concrete fix.

## Pull requests

- Keep each pull request focused on one change.
- Quote the DBIM section you are implementing in the description.
- If a change alters scores, mention which sites you tested it on and how their results changed.
