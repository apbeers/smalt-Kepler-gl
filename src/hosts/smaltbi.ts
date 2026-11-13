/**
 * smaltgl's map visuals as a smaltbi plugin (smaltbi docs/PLUGINS.md, plugin API version 1). Built into one file with
 * nothing to import (`dist/smaltbi-plugin.js`, the tile worker inlined), as smaltbi's plugin loader requires.
 *
 * It registers one smaltbi visual per entry of smaltgl's catalogue (`smaltgl.points`, `smaltgl.hexbin`, …), with the
 * catalogue's roles and options. smaltbi calls `render(ctx)` each time a visual draws; the plugin keeps one
 * `MapVisual` per frame element across those calls (the GPU device, the basemap and its tiles live on), passes the
 * data by role, the theme's colours and the selection, and turns clicks into smaltbi selections (cross-filtering).
 *
 * smaltbi's API has no hook for a visual being removed, so the plugin checks whether each map's element is still in
 * the page on every render and every few seconds, and frees the GPU when it is gone. (A `dispose` hook in smaltbi
 * would make this exact: docs/guide/embedding.md lists what smaltbi needs.)
 */
import { MapVisual, VISUALS, themeFromCss, type VisualColumn, type VisualData, type VisualKind, type VisualTheme } from '../visual/index.js';

// The parts of smaltbi's plugin API this plugin uses (src/visuals/api.ts there), written out: the plugin imports
// nothing.
interface SbColumn {
  readonly values: ArrayLike<unknown>;
  readonly label?: string;
  fmt?(value: unknown): string;
}
interface SbData {
  readonly rows: number;
  role(name: string): SbColumn[];
}
export interface SbRenderContext {
  readonly el: HTMLElement;
  readonly width: number;
  readonly height: number;
  readonly options: Record<string, unknown>;
  readonly data: SbData;
  readonly base?: string;
  selected(row: number): boolean | null;
  readonly api: { select(row: number, additive?: boolean): void; setFilters(filters: unknown[]): void };
}
export interface SbApi {
  readonly apiVersion: number;
  registerVisual(def: Record<string, unknown>): void;
}

/** Built in by scripts/build-plugin.mjs: the tile worker's code, so the plugin needs no second file. */
declare const __SMALTGL_TILE_WORKER__: string | undefined;

const PLUGIN_API_VERSION = 1;

/** The theme variables smaltbi passes to its kit (styles/report.css there). */
const THEME_VARS = {
  palette: Array.from({ length: 12 }, (_, i) => `--sk-c${i}`),
  sequential: ['--sk-seq-lo', '--sk-seq-hi'],
  background: '--sk-surface',
};

const ICONS: Record<VisualKind, string> = {
  points: '<svg viewBox="0 0 24 24"><rect x="4" y="12" width="4" height="4" rx="1"/><rect x="10" y="6" width="4" height="4" rx="1"/><rect x="15" y="14" width="5" height="5" rx="1"/></svg>',
  heatmap: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="8" opacity=".35"/><rect x="8" y="8" width="8" height="8" rx="4"/></svg>',
  hexbin: '<svg viewBox="0 0 24 24"><polygon points="12,3 19,7 19,15 12,19 5,15 5,7"/></svg>',
  arcs: '<svg viewBox="0 0 24 24"><path d="M4 18 Q12 2 20 18" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
  regions: '<svg viewBox="0 0 24 24"><polygon points="3,6 10,4 14,9 21,8 20,18 11,20 4,16"/></svg>',
};

interface Mounted {
  readonly el: HTMLElement;
  readonly host: HTMLDivElement;
  visual?: MapVisual;
  /** The latest render, applied once the map is ready. */
  ctx: SbRenderContext;
  kind: VisualKind;
  failed?: boolean;
}

const mounted = new Map<HTMLElement, Mounted>();
const dataViews = new WeakMap<SbData, VisualData>();
const themes = new Map<string, VisualTheme>();
let sweeper: ReturnType<typeof setInterval> | undefined;

/** smaltbi's columns by role, as a smaltgl VisualData (one per result, so the visual sees the same data again). */
function dataOf(d: SbData): VisualData {
  let v = dataViews.get(d);
  if (!v) {
    const cache = new Map<string, VisualColumn | undefined>();
    v = {
      rows: d.rows,
      column(role) {
        if (!cache.has(role)) {
          const c = d.role(role)[0];
          cache.set(role, c ? { values: c.values, label: c.label, format: c.fmt ? (x) => c.fmt!(x) : undefined } : undefined);
        }
        return cache.get(role);
      },
    };
    dataViews.set(d, v);
  }
  return v;
}

/** The theme at `el`, the same object while the colours stay the same (so it doesn't force new layers). */
function themeAt(el: Element): VisualTheme {
  const t = themeFromCss(el, THEME_VARS);
  const key = JSON.stringify(t);
  let have = themes.get(key);
  if (!have) themes.set(key, (have = t));
  return have;
}

/** Frees the maps whose elements left the page. */
function sweep(): void {
  for (const [el, m] of mounted)
    if (!el.isConnected || !el.contains(m.host)) {
      m.visual?.destroy();
      mounted.delete(el);
    }
  if (!mounted.size && sweeper) {
    clearInterval(sweeper);
    sweeper = undefined;
  }
}

function createWorker(): Worker | undefined {
  if (typeof __SMALTGL_TILE_WORKER__ === 'undefined' || !__SMALTGL_TILE_WORKER__) return undefined;
  const url = URL.createObjectURL(new Blob([__SMALTGL_TILE_WORKER__], { type: 'text/javascript' }));
  return new Worker(url, { type: 'module', name: 'smaltgl tiles' });
}

function apply(m: Mounted): void {
  const ctx = m.ctx;
  m.visual?.update({ kind: m.kind, data: dataOf(ctx.data), options: ctx.options, theme: themeAt(ctx.el), selection: (row) => ctx.selected(row), base: ctx.base });
}

/** smaltbi's render for a map visual of `kind`. */
export function render(kind: VisualKind, ctx: SbRenderContext): void {
  sweep();
  let m = mounted.get(ctx.el);
  if (m && m.kind !== kind) {
    m.visual?.destroy();
    mounted.delete(ctx.el);
    m = undefined;
  }
  if (m) {
    m.ctx = ctx;
    if (m.visual) apply(m);
    return;
  }
  const host = ctx.el.ownerDocument.createElement('div');
  host.className = 'smaltgl-visual';
  host.style.cssText = 'position:relative;width:100%;height:100%;';
  ctx.el.replaceChildren(host);
  const entry: Mounted = { el: ctx.el, host, ctx, kind };
  mounted.set(ctx.el, entry);
  sweeper ??= setInterval(sweep, 3000);
  const worker = createWorker;
  void MapVisual.mount(host, {
    onSelect: (row, additive) => {
      if (row === null) entry.ctx.api.setFilters([]);
      else entry.ctx.api.select(row, additive);
    },
    createWorker: typeof __SMALTGL_TILE_WORKER__ === 'string' ? () => worker()! : undefined,
  }).then(
    (v) => {
      if (mounted.get(ctx.el) !== entry) return v.destroy();
      entry.visual = v;
      apply(entry);
    },
    (e: Error) => {
      entry.failed = true;
      const msg = e?.name === 'GpuUnavailableError' ? 'This map needs WebGPU (Chrome or Edge 113+, Safari 26+, Firefox 141+ on Windows).' : `The map could not start: ${e?.message ?? e}`;
      host.innerHTML = `<div class="sk-empty">${msg.replace(/[<&]/g, '')}</div>`;
    },
  );
}

/** The maps on the page now (for tests and exports): wait for them with `ready()`. */
export function visuals(): MapVisual[] {
  return [...mounted.values()].flatMap((m) => (m.visual ? [m.visual] : []));
}

/** The plugin: smaltbi calls `setup(api)` once. */
const plugin = {
  name: 'smaltgl maps',
  apiVersion: PLUGIN_API_VERSION,
  setup(api: SbApi): void {
    for (const d of Object.values(VISUALS)) {
      api.registerVisual({
        type: `smaltgl.${d.kind}`,
        label: d.label,
        icon: ICONS[d.kind],
        group: 'plugin',
        roles: d.roles.map((r) => ({ name: r.name, label: r.label, kind: r.kind, max: r.max })),
        options: d.options.map((o) => ({ key: o.key, label: o.label, type: o.type, default: o.default, ...(o.choices ? { choices: o.choices.map((c) => [c[0], c[1]]) } : {}), ...(o.when ? { when: { ...o.when } } : {}), section: 'Map' })),
        limit: d.rowLimit,
        sort: 'category',
        // The map handles its own clicks and draws selection itself: smaltbi calls render again when it changes.
        selfInteractive: true,
        render: (ctx: SbRenderContext) => render(d.kind, ctx),
      });
    }
  },
};

export default plugin;
