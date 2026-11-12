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
| `npm ci` | Installs dependencies (smaltdb from npm; smaltcy pinned to a commit of `apbeers/smalt-graph-db`) |
| `npm run check` | Typecheck, then the unit tests (vitest). Before every commit |
| `npm run test:browser` | Headless Chromium with WebGPU on SwiftShader: layers, basemap, then builds the site and runs every docs example and the tech demo. What CI runs |
| `npm run bench` | Frame times per layer and size, headless (compare changes; don't quote) |
| `npm run docs:dev` / `docs:build` | The site |
| `npm run build` | `dist/` and type declarations |

Playwright is installed globally in the cloud containers; don't run `playwright install`. Real OpenFreeMap tiles need
`tiles.openfreemap.org` in the environment's allowed hosts; the tests never fetch them (generated fixture tiles).

## Layers and rules

- `src/core/` imports nothing else; layers import core; the basemap imports core and the layer types; `src/data/`
  imports nothing (smaltdb and smaltcy are passed in, used through their public methods). No runtime dependencies:
  ask the owner before adding any package, as the family's rules say.
- A layer uploads its data once in `attach`; anything that changes per frame (view, filters, time, looks) is a uniform
  written into the frame's arena slot. Keep it that way: no per-frame uploads proportional to the data.
- Every pipeline in the map's pass declares `NO_STENCIL` (or the basemap's stencil states) and the map's sample count.
- WGSL: `target` is a reserved word.
- The OpenMapTiles schema's layer and class names live only in `src/basemap/style.ts`.
- Every ```` ```js run ```` block in `docs/` runs on a live map; `test/browser/docs.mjs` runs each on the built site.
  Examples use only names in scope (`map`, smaltgl's exports, `generate`, `smaltdb`, `smaltcy`).
- The tech demo's datasets are in `docs/.vitepress/theme/demo-datasets.ts`; `test/browser/demo.mjs` loads each.
- No fixed sleeps in unit tests. Probe tests (`test/zz-*.test.ts`) are scratch: never commit them.
- A significant decision gets an ADR in `docs/adr/`.
