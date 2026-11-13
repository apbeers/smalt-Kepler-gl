# Map visuals in other apps

smaltgl's maps can be visuals inside another app: a BI report, a notebook, a dashboard. The host owns the data, the
query, the layout, the theme and the selection; smaltgl draws. `@smaltworks/smaltgl/visual` is the piece for that,
and it knows nothing of any particular host. It is the family kit's `smaltkit/geo/visual`
([ADR 0003](../adr/0003-visuals-in-smaltkit)): an app that already uses smaltkit imports it from there. Adapters for one host each live in `src/hosts/`; the first is
[smaltbi](https://github.com/stenhoor/smaltbi)'s plugin.

## The contract

**A catalogue.** `VISUALS` describes each map visual as data: its **roles** (the fields it takes, each a `dimension`
the host groups by or a `measure` it aggregates) and its **options** (with types, choices and defaults). The shapes
are the ones BI tools build a field well and an options panel from, so a host can register them as they are.

| Visual | Roles | Selectable |
| --- | --- | --- |
| `points` | latitude, longitude; colour by (measure), category, size by | yes |
| `heatmap` | latitude, longitude; weight | no |
| `hexbin` | latitude, longitude; value (count, sum or mean; 3D columns) | no |
| `arcs` | origin and destination latitude and longitude; colour by | yes |
| `regions` | location (matched to a GeoJSON file's property); colour by (3D blocks) | yes |

**Data by role.** The host runs the query and hands each role's column over: values (numbers, numeric text, bigints,
nulls, text for categories), a label, and a formatter for tooltips. Columns stay columns: no object per row.

**A controller that lives across renders.** Hosts render often (new data, a resize, a selection elsewhere). A
`MapVisual` is mounted once per frame and updated each time: the GPU device, the basemap and its tiles live on;
layers are rebuilt only when the data or what it means changes; looks and selection change in place.

```ts
import { MapVisual, themeFromCss, type VisualData } from '@smaltworks/smaltgl/visual';

declare const frame: HTMLElement, lat: Float64Array, lng: Float64Array, sales: Float64Array, host: { select(row: number, additive: boolean): void };

const visual = await MapVisual.mount(frame, {
  // A click: the data row (or null for the empty map), and whether Ctrl, Cmd or Shift was held.
  onSelect: (row, additive) => (row === null ? undefined : host.select(row, additive)),
});

const data: VisualData = {
  rows: lat.length,
  column: (role) =>
    role === 'latitude' ? { values: lat, label: 'Latitude' }
    : role === 'longitude' ? { values: lng, label: 'Longitude' }
    : role === 'values' ? { values: sales, label: 'Sales', format: (v) => `$${v}` }
    : undefined,
};

// Every time the host renders: the same data object means the same data (no new layers).
visual.update({
  kind: 'points',
  data,
  options: { radius: 4, basemap: 'auto' },
  theme: themeFromCss(frame, { palette: ['--c0', '--c1', '--c2'], sequential: ['--seq-lo', '--seq-hi'], background: '--surface' }),
  selection: (row) => null, // or true/false per row: unselected rows are dimmed on the GPU
});

await visual.ready(); // tiles loaded and drawn: safe to export
visual.destroy(); // when the host removes the visual
```

**The host's theme.** `themeFromCss(el, names)` reads the host's CSS variables (a categorical palette, a sequential
ramp, the background) in any colour syntax the browser knows, `oklch()` and `color-mix()` included. With the
`basemap: 'auto'` option the map follows the theme into light or dark.

**Selection.** Selection is a byte per row on the GPU: changing it is one small upload, and unselected rows are
dimmed. Clicks come back as data rows, so cross-filtering works the way the host already does it. Visuals that
aggregate on the GPU (heatmap, hexagons) don't select rows: a bin isn't a row.

## In smaltbi

`npm run build` writes `dist/smaltbi-plugin.js`: one ES module with nothing to import (the tile worker inlined), as
smaltbi's plugin loader requires. In the designer, **File → Plugins…** adds it by URL; the report records its hash.
It registers `smaltgl.points`, `smaltgl.heatmap`, `smaltgl.hexbin`, `smaltgl.arcs` and `smaltgl.regions`, with the
catalogue's roles and options, in the gallery's plugin group.

What the plugin does with smaltbi's API (version 1):

| smaltbi | The plugin |
| --- | --- |
| `render(ctx)`, called again and again into the same frame | Mounts one `MapVisual` per frame and updates it |
| `ctx.data.role(name)` columns, with `fmt` | `VisualData`; formatters show in tooltips |
| `--sk-c0…11`, `--sk-seq-lo`, `--sk-seq-hi`, `--sk-surface` | The palette, the ramp, light or dark |
| `ctx.selected(row)` | The selection on the GPU |
| `ctx.api.select(row, additive)`, `setFilters([])` | A click on a point, an arc or a region; a click on the empty map |
| `limit` | The catalogue's row limit per visual |
| `selfInteractive: true` | smaltbi draws again when the selection changes; the plugin handles its own clicks |

`test/browser/smaltbi.mjs` builds the plugin and loads it the way smaltbi does, then checks each of these.

### What smaltbi needs for maps to be first-class

The step-by-step handoff for smaltbi's side, with file pointers and acceptance criteria, is
[Integrating smaltgl's map visuals into smaltbi](../integrations/smaltbi).

The plugin works with smaltbi's API as it is. These changes would make it exact rather than careful; they are
recorded in [ADR 0002](../adr/0002-visuals-for-hosts):

1. **A teardown hook.** smaltbi's `VisualDef` has no `dispose(el)`. The plugin frees a map's GPU device when it finds
   the frame gone from the page (checked on every render and every few seconds). A hook would free it at once.
2. **Row-level queries and higher limits.** The default plan groups by every dimension, which suits locations with
   totals. Millions of raw points need a plan that doesn't group (or a query mode that returns rows as they are),
   limits above the designer's usual caps, and the result kept as columns (`Float64Array`), as smaltdb returns it.
3. **A readiness signal for export.** A map draws after its tiles arrive. An export or print step should wait for
   the visual (the plugin can expose `ready()`), and an export plugin needs to read pixels from a WebGPU canvas.
4. **Spatial selection for binned visuals.** A hexagon or heatmap cell is a region, not a row. A filter kind for
   "latitude and longitude within a box or a cell" would let binned maps cross-filter too.
5. **Page settings for the network.** The basemap fetches tiles (OpenFreeMap by default) and starts a blob worker. A
   report should be able to choose its tile source (self-hosted, or none for offline reports), and published sites
   need `worker-src blob:` if they set a Content-Security-Policy.
6. **One GPU device for many maps.** Each map asks for its own device. A page of many maps would do better with one
   device shared by every visual (`MountOptions.device` takes it).
