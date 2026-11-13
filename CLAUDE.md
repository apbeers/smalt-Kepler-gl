# CLAUDE.md

smaltgl (repository `smalt-Kepler-gl`, npm `@smaltworks/smaltgl`) draws location data on maps in the browser with
WebGPU: layers of typed-array columns, a vector basemap drawn by its own renderer, and adapters for smaltdb and
smaltcy. It is part of the smalt family: smaltdb's CLAUDE.md has the family's shared working rules, and they apply
here too. This repository is a temporary home; the owner plans to move the code to its own repository.

## Brand: read smalt-brand first

Before changing the site, the README or how the product is described, read smalt-brand's `BRAND.md` and
`DECISIONS.md`. Copy the site theme (`docs/.vitepress/theme/{shiki.ts,smaltdb.css,smaltworks.ts,stage.ts}`) and the
badges unchanged from the family. smaltgl has no mark or product colour yet (ADR 0001, "Open"): don't invent one. No
unsourced performance claims: a number appears only with its benchmark and method.

## Workflow

Early development (owner, 2026-11-12): no pull requests. When work is done and `npm run check` passes, commit and push
it straight to `main`. This replaces the family rule of one PR per task until the owner says otherwise.

TypeScript is 7.1 (the owner asked for the newest with full WebGPU types): its DOM library declares WebGPU, including
`GPUBufferUsage` and the other flag constants, so there is no WebGPU shim. Don't add one back.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Installs dependencies (smaltdb from npm; smaltkit and smaltcy pinned to commits: `apbeers/smaltkit`, `apbeers/smalt-graph-db`) |
| `npm run check` | Typecheck, then the unit tests (vitest). Before every commit |
| `npm run test:browser` | Headless Chromium with WebGPU on SwiftShader: layers, basemap, then builds the site and runs every docs example and the tech demo. What CI runs |
| `npm run bench` | Frame times per layer and size, headless (compare changes; don't quote) |
| `npm run docs:dev` / `docs:build` | The site |
| `npm run build` | `dist/` and type declarations |

Playwright is installed globally in the cloud containers; don't run `playwright install`. Real OpenFreeMap tiles need
`tiles.openfreemap.org` in the environment's allowed hosts; the tests never fetch them (generated fixture tiles).

## Layers and rules

- **The drawing code is smaltkit's (owner, 2026-11-13; ADR 0003).** core, map, layers, basemap, data and visual live in
  the shared kit as `smaltkit/geo/<piece>` (`src/geo/` there), so smaltbi and the other apps draw with the same code.
  Here each of those entry points is one line re-exporting the kit's piece. Change drawing code in smaltkit (its
  rules: a branch and a PR, tests with `node --test`), then bump the `smaltkit` pin in package.json and run the
  browser tests here: they are where the kit's GPU code meets a device. smaltgl's own code is `src/datasets/`,
  `src/hosts/`, the docs and the tech demo. The rules below about layers, pipelines and WGSL apply to that code in the
  kit.
- **Modular (owner, 2026-11-12):** every piece is meant to be reused, changed or worked on alone. Each is an entry
  point in `scripts/entries.mjs` (the build, vitest and the docs site read it; package.json exports and tsconfig paths
  follow it). The kit's `test/geo-modules.test.ts` holds the import rules between pieces (core imports nothing else;
  map, layers and basemap import only core, meeting in `core/contract.ts`; no layer imports another; the tile source
  and vector-tile code use no GPU; data stands alone); `test/modules.test.ts` here checks that each entry is the kit's
  piece, that datasets stand alone, and bundles entries alone to check what comes along. A new dependency between
  pieces changes those tests on purpose, never by accident.
- A new entry point goes in `scripts/entries.mjs`, package.json `exports`, tsconfig `paths`, and the table in
  `docs/guide/modules.md` (the modules test checks all four) and the README. The ```` ```ts ```` examples in the
  guides to the pieces are type-checked (`test/docs-ts.test.ts`).
- **Visuals for hosts (ADR 0002):** `smaltkit/geo/visual` is the host-agnostic piece (catalogue of visuals with roles and
  options, `buildVisual`, `themeFromCss`, `MapVisual`). `src/hosts/` has one adapter per host, importing only
  `visual`; `src/hosts/smaltbi.ts` is built by `scripts/build-plugin.mjs` into `dist/smaltbi-plugin.js` (one file,
  nothing to import), and `test/browser/smaltbi.mjs` loads it the way smaltbi does. The catalogue is a contract with
  saved reports: add roles and options, don't rename them. `docs/integrations/smaltbi.md` is the handoff for smaltbi's
  side (steps, file pointers, acceptance criteria): keep it current when the plugin or the catalogue changes.
- The tech demo's logic is plain TypeScript in `docs/.vitepress/theme/demo/` (layers for a dataset and settings,
  files, links), tested in `test/demo.test.ts`; `TechDemo.vue` is the page around it.
- smaltdb and smaltcy are passed in and used through their public methods: smaltgl imports neither. The one runtime
  dependency is the family's smaltkit; ask the owner before adding any other package, as the family's rules say.
- A layer uploads its data once in `attach`; anything that changes per frame (view, filters, time, looks) is a uniform
  written into the frame's arena slot. Keep it that way: no per-frame uploads proportional to the data.
- Every pipeline in the map's pass declares `NO_STENCIL` (or the basemap's stencil states) and the map's sample count.
- WGSL: `target` is a reserved word.
- The OpenMapTiles schema's layer and class names live only in smaltkit's `src/geo/basemap/style.ts`.
- Every ```` ```js run ```` block in `docs/` runs on a live map; `test/browser/docs.mjs` runs each on the built site.
  Examples use only names in scope (`map`, smaltgl's exports, `generate`, `smaltdb`, `smaltcy`).
- The tech demo's datasets are in `docs/.vitepress/theme/demo-datasets.ts`; `test/browser/demo.mjs` loads each.
- No fixed sleeps in unit tests. Probe tests (`test/zz-*.test.ts`) are scratch: never commit them.
- A significant decision gets an ADR in `docs/adr/`.
