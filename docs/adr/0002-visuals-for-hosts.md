# ADR 0002: Map visuals for hosts

- **Status:** accepted (2026-11-13)
- **Owner's direction:** the visualizations, and the way they accept data, are built so that smaltbi can include them
  as visuals; smaltbi will need updates, and the architecture must support pulling the visuals in.

## Context

[smaltbi](https://github.com/stenhoor/smaltbi) is the family's BI tool. Its visuals are `VisualDef`s: data roles
(dimensions it groups by, measures it aggregates), options, an optional query plan, and `render(ctx)`, which smaltbi
calls with columnar data by role, the frame's size, a selection test and an API for cross-filtering. Outside visuals
come in as plugins: one ES module with no imports, loaded by hash (smaltbi ADR 0008). Its own charts are SVG strings
rewritten on every render; it already has a map visual of its own (`smaltkit/maps`), drawn in SVG.

A WebGPU map can't be rewritten on every render: it holds a device, pipelines, uploaded data and loaded tiles. And
other hosts are coming (smaltnb's notebooks, dashboards), each with its own visual API.

## Decisions

1. **A host-agnostic visual piece, `@smaltworks/smaltgl/visual`.** It knows no host. It holds:
   - a **catalogue** (`VISUALS`): each map visual's roles and options as data, in the shapes BI tools use;
   - **`buildVisual`**: role-tagged columns, options and a theme to layers, as a pure function;
   - **`themeFromCss`**: a host's colours from its CSS variables, in any colour syntax;
   - **`MapVisual`**: a controller mounted once per frame and updated on every host render, rebuilding layers only
     when the data or its meaning changes.
2. **Hosts adapt to the piece, in `src/hosts/`.** One file per host, importing only `visual` (the modules test holds
   this). The first is smaltbi's plugin, built by `scripts/build-plugin.mjs` into one file with nothing to import and
   the tile worker inlined (`dist/smaltbi-plugin.js`).
3. **Data arrives by role, as columns.** A host passes each role's column (values, label, formatter); a column object
   that is the same as last time means the same data. Values may be numbers, numeric text, bigints or nulls, as SQL
   results have them.
4. **Selection lives on the GPU.** Layers take a byte per row (`setSelection`) and dim unselected rows in the
   shader. A selection change is one small upload, never a rebuild. Clicks come back as data rows (through
   `rowOf` where a layer's objects aren't rows, as with regions), so the host cross-filters as it already does.
   Binned visuals (heatmap, hexagons) don't select rows.
5. **Only what the API allows, and the rest asked of smaltbi.** The plugin works with smaltbi's plugin API 1 as it is
   (it frees maps whose frames left the page by checking, since there is no teardown hook). What smaltbi should add
   is listed in [Map visuals in other apps](../guide/embedding#what-smaltbi-needs-for-maps-to-be-first-class): a
   teardown hook, row-level queries and higher limits, a readiness signal for export, spatial filters for binned
   visuals, page settings for the tile source and CSP, and a shared GPU device.

## Consequences

- smaltbi gets five map visuals by adding one plugin file, before any change on its side.
- smaltbi's own SVG map stays as it is for small maps that must print and export as vectors; the GPU maps are for
  large data, density, flows and 3D.
- A new host means a new file in `src/hosts/`, not changes to the visuals.
- The catalogue is the contract: changing a role's name or meaning breaks reports that use it. Add roles and options;
  don't rename them.
