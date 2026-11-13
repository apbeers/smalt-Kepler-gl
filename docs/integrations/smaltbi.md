# Integrating smaltgl's map visuals into smaltbi

A handoff for whoever (person or agent) works in [smaltbi](https://github.com/stenhoor/smaltbi) to bring smaltgl's
GPU map visuals in. smaltgl's side is done and tested; this file says what smaltbi does, in order, with where in
smaltbi's code and how to know each step is done.

Read first, in smaltbi: `CLAUDE.md` (its working rules, including asking the owner before adding outside code),
`docs/PLUGINS.md` and `docs/adr/0008-plugin-loading.md` (plugins), `docs/ARCHITECTURE.md` ("From a visual to SQL").
In smaltgl: [ADR 0002](../adr/0002-visuals-for-hosts) (why it is built this way) and
[Map visuals in other apps](../guide/embedding) (the contract).

## What smaltgl provides

| Piece | Where (smaltgl) | What it is |
| --- | --- | --- |
| The plugin | `src/hosts/smaltbi.ts`, built by `scripts/build-plugin.mjs` into `dist/smaltbi-plugin.js` | A smaltbi plugin (API 1): one ES module, nothing to import, the tile worker inlined, about 130 KB |
| The visuals it registers | `src/visual/catalogue.ts` (`VISUALS`) | `smaltgl.points`, `smaltgl.heatmap`, `smaltgl.hexbin`, `smaltgl.arcs`, `smaltgl.regions` |
| The controller | `src/visual/visual.ts` (`MapVisual`) | Mounted once per frame, updated on every `render(ctx)`; keeps the GPU device and tiles |
| Its test | `test/browser/smaltbi.mjs`, `test/browser/pages/smaltbi-host.ts` | Loads the built file as smaltbi's loader does and drives it with smaltbi-shaped data |

The visuals' roles (smaltbi `RoleDef`s; all `max: 1`):

| Type | Dimension roles | Measure roles | Row limit | Cross-filters |
| --- | --- | --- | --- | --- |
| `smaltgl.points` | `latitude`, `longitude`, `category` | `values` (colour), `size` | 1,000,000 | yes |
| `smaltgl.heatmap` | `latitude`, `longitude` | `weight` | 2,000,000 | no |
| `smaltgl.hexbin` | `latitude`, `longitude` | `values` | 2,000,000 | no |
| `smaltgl.arcs` | `originLatitude`, `originLongitude`, `destinationLatitude`, `destinationLongitude` | `values` | 200,000 | yes |
| `smaltgl.regions` | `location` | `values` | 50,000 | yes |

Every visual has a `basemap` option (`auto` follows the theme, `light`, `dark`, `none`) and `tilt`; the rest are in
`src/visual/catalogue.ts`. Type names and role names are a contract with saved reports: smaltgl adds, never renames.

The plugin reads these theme variables (already set in smaltbi's `styles/report.css`): `--sk-c0` … `--sk-c11`
(categories), `--sk-seq-lo` and `--sk-seq-hi` (values), `--sk-surface` (light or dark).

## Step 0: get the plugin file

Build it from a pinned smaltgl commit (smaltgl isn't on npm yet):

```sh
git clone https://github.com/apbeers/smalt-Kepler-gl smaltgl && cd smaltgl
git checkout <commit>
npm ci
node scripts/build-plugin.mjs --out ../smaltbi/examples/plugins/smaltgl-maps.js
```

Where the file lives in smaltbi is smaltbi's call. Its plugins are loaded by URL and hash (ADR 0008), so for reports
any URL works; for smaltbi's own tests and examples, a copy next to `examples/plugins/bullet.js` is simplest. It is
family code (MIT), but it is code from another repository: follow smaltbi's CLAUDE.md rule and confirm with the owner
before committing a copy. Record the smaltgl commit it was built from beside it.

## Step 1: it works today (no smaltbi changes)

With the file served from somewhere, **File → Plugins…** adds it by URL; smaltbi records its hash. The five visuals
appear at the end of the gallery (group `plugin`). What already works through plugin API 1:

- data by role, as columns (`ctx.data.role(name)`), with formatters in tooltips;
- the theme's palette and ramp, and the dark basemap on dark themes;
- cross-filtering: `ctx.selected(row)` dims other rows on the GPU; a click calls `ctx.api.select(row, additive)`
  (additive with Ctrl, Cmd or Shift), and a click on the empty map `ctx.api.setFilters([])`;
- `selfInteractive: true`, so smaltbi calls `render` again when the selection changes, and the plugin keeps its map
  across those calls.

**Do:** add an end-to-end test in smaltbi like the bullet plugin's (`test/e2e.mjs`, "plugins (ADR 0008)"): a report
with `plugins: [{ url, integrity }]` and a `smaltgl.points` visual over a small table with latitude and longitude
columns (add a fixture table if the sample model has none).

- Headless Chromium needs WebGPU: launch with the flags in smaltgl's `test/browser/harness.mjs` (`WEBGPU_ARGS`, which
  run WebGPU on SwiftShader, no GPU needed).
- Use `basemap: 'none'` in the test report, so it needs no network.

**Done when:** the visual renders a canvas with coloured pixels, a click on a point selects it (other visuals on the
page filter), and selecting in another visual dims the map's other points.

## Step 2: the changes that make maps first-class

In priority order. Each is additive (optional fields), so it stays within plugin API 1 unless noted; the smaltgl side
of each is small and is listed so the two can land together.

### 2.1 A teardown hook for visuals

**Why.** A GPU map holds a device, uploaded data and tiles. smaltbi has no hook when a visual's frame goes away, so
the plugin checks whether its frame is still in the page on every render and every 3 seconds. Until then, a removed
map holds its GPU memory.

**Where (smaltbi).**
- `src/visuals/api.ts`, `VisualDef`: add `dispose?(el: HTMLElement): void`.
- `src/report/view.ts`: call it for a visual's body element whenever that element is dropped:
  - a page change or re-layout that replaces the frames;
  - a deleted visual;
  - `ReportView.destroy()` (around `destroy(): void`);
  - `drawRepeat`, whose `rt.body.replaceChildren(...)` replaces the panels' bodies;
  - an error message written over the body (`rt.body.innerHTML = …`);
  - a change of the visual's type.

**smaltgl side.** The adapter's `dispose` calls `MapVisual.destroy()` and stops the periodic check
(`src/hosts/smaltbi.ts`: `sweep`).

**Done when:** a page switch frees each map's device immediately. Test with a plugin visual that counts `dispose`
calls, the bullet example extended.

### 2.2 Row-level queries, and limits for big data

**Why.** The default plan (`ReportView.plan()` in `src/report/view.ts`, `defaultPlan`) groups by every dimension and
aggregates every measure. For locations with totals that is right. For a million GPS pings it means a `GROUP BY`
over latitude and longitude that returns nearly every row anyway, more slowly, and the designer's row limits are
sized for SVG charts (thousands).

**Where (smaltbi).**
- `src/core/compile.ts`, `QuerySpec`: add `rows?: true`. `compileQuery` then emits no `GROUP BY` and no aggregate.
  Dimension fields are selected as they are. Measure-role fields must be columns (with `agg` ignored), and a
  measure-type field (an aggregate expression) is an error naming the field.
- `src/visuals/api.ts`, `VisualDef`: a flag such as `rows?: 'grouped' | 'raw' | 'choose'`. With `'choose'`, the
  designer shows an "Aggregate by location" switch that sets the plan.
- `src/designer/panel.ts` ("Row limit"): allow the plugin's `limit` (up to millions) without a lower cap.
- `src/data/runner.ts`: results are already columnar (`Float64Array` for numbers). Keep them so; for very large
  results, consider not caching them by SQL text (memory).

**smaltgl side.** The catalogue says which visuals want raw rows (`heatmap`, `hexbin`, and `points` when not
aggregating); the adapter sets the flag.

**Done when:** a `smaltgl.heatmap` over a 1,000,000-row table runs one `SELECT lat, lng` (no `GROUP BY`) and draws.

### 2.3 A ready signal for export and print

**Why.** A map finishes drawing after its tiles arrive, after `render` returns. An export or print step that
captures right away gets an empty or half-drawn map, and a WebGPU canvas's pixels must be read in the frame they
are drawn, or through the plugin.

**Where (smaltbi).**
- `VisualDef`: add `ready?(el: HTMLElement): Promise<void>` and `snapshot?(el: HTMLElement): Promise<Blob>`
  (a PNG of the visual).
- Any export, print or thumbnail path (there is none for PNG yet; `src/publish/` publishes sites) awaits `ready`
  for every visual on the page, and uses `snapshot` where the visual has one instead of reading the DOM.

**smaltgl side.** `MapVisual.ready()` exists (waits for tiles and the GPU). `snapshot()` is a follow-up: draw one
frame and copy the canvas (`toBlob` in the same task as the frame).

**Done when:** printing a page with a map shows the map with its basemap.

### 2.4 Cross-filtering from binned maps (no smaltbi change needed)

**Why.** A hexagon or a heatmap cell is an area, not a row, so binned maps don't select today.

**How.** smaltbi's filters already have `between` (`src/core/types.ts`, `FilterOp`), and each data column carries its
`field` (`ResolvedField`, with `ref`). The plugin can call `ctx.api.setFilters([{ field: lat.field.ref, op: 'between',
values: [south, north] }, { field: lng.field.ref, op: 'between', values: [west, east] }])` for a clicked cell. This is
smaltgl's to do (`src/hosts/smaltbi.ts`, `src/visual/visual.ts`).

**smaltbi:** confirm only that a visual's own `between` selections highlight rather than filter itself, as tuple
selections do (`ReportView.setSelection`, `restyle`). The plugin draws them, since it is self-interactive.

**Done when:** clicking a hexagon filters the page's other visuals to that cell.

### 2.5 Report settings for the basemap

**Why.** The basemap fetches OpenStreetMap vector tiles from OpenFreeMap by default, and starts its tile worker from
a blob URL. A report may need its own tile host, or no basemap at all (offline, or private networks). A published
site with a Content-Security-Policy must allow blob workers.

**Where (smaltbi).**
- `src/core/types.ts`, `PluginRef`: add `settings?: Record<string, unknown>`.
- `src/plugins/loader.ts`: pass a plugin's settings to `setup(api)` as `api.settings`.
- `src/plugins/ui.ts`: a place to edit them. For this plugin: `{ "tiles": "<TileJSON URL or tile template>" }`, or
  `{ "basemap": "none" }`.
- `src/publish/publish.ts`: if published sites ever set a CSP, include `worker-src blob:`, and the tile host in
  `connect-src`.

**smaltgl side.** The adapter passes `api.settings.tiles` to `MapVisual.mount` (`MountOptions.tiles`), and
`basemap: 'none'` overrides the visual's option.

**Done when:** a report with `settings: { tiles: … }` draws tiles from that host, and one with `basemap: 'none'`
makes no tile requests.

### 2.6 One GPU device for every map on a page

**Why.** Each map asks the browser for its own GPU device; a dashboard of many maps would do better with one.

**Where (smaltbi).** The plugin API gains `gpu?(): Promise<GPUDevice | null>`: one device for the page, requested
once, shared by every plugin that asks. This is a new API member: bump to plugin API 2 if the owner prefers, or
add it as optional to version 1.

**smaltgl side.** The adapter passes it to `MapVisual.mount` (`MountOptions.device`). The map never destroys a device
it was given.

**Done when:** a page with four maps creates one device (`requestDevice` called once).

## Things not to change

- smaltbi's own `map` visual (SVG, `smaltkit/maps`) stays: small maps that print and export as vectors. smaltgl's
  are for large data, density, flows and 3D.
- The plugin uses no smaltbi internals, only plugin API 1, so smaltbi can refactor freely behind that API.

## Checklist

- [ ] Step 0: plugin file built from a pinned smaltgl commit, location agreed with the owner
- [ ] Step 1: end-to-end test of `smaltgl.points` in smaltbi (render, click selects, selection dims)
- [ ] 2.1 `dispose(el)` on `VisualDef`, called wherever a visual's body is dropped
- [ ] 2.2 row-level queries (`QuerySpec.rows`) and plugin limits in the designer
- [ ] 2.3 `ready(el)` and `snapshot(el)` awaited by export and print
- [ ] 2.4 binned cross-filtering (smaltgl side; smaltbi confirms highlighting)
- [ ] 2.5 plugin settings (tile source, no basemap) and CSP for published sites
- [ ] 2.6 a shared GPU device for plugins

When a smaltbi change lands, tell the smaltgl side (an issue in `apbeers/smalt-Kepler-gl`) so the adapter starts
using it; the plugin keeps working without each one.
