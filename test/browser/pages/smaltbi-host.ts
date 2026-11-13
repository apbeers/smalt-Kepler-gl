// A stand-in for smaltbi's report view: loads dist/smaltbi-plugin.js the way smaltbi's plugin loader does (fetch,
// blob URL, import, setup(api)), then renders its visuals with smaltbi-shaped data (columns by role, with labels and
// formatters), a selection, and smaltbi's select and setFilters calls recorded.
type Def = { type: string; roles: { name: string }[]; options: { key: string; default: unknown }[]; render(ctx: unknown): void; selfInteractive?: boolean; limit?: number };

const defs = new Map<string, Def>();
const calls: unknown[][] = [];
const code = await (await fetch('/smaltbi-plugin.js')).text();
const mod = await import(/* @vite-ignore */ URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
mod.default.setup({ apiVersion: 1, registerVisual: (d: Def) => defs.set(d.type, d) });

// Theme variables as smaltbi's report.css sets them.
document.body.style.cssText = '--sk-c0:#d1495b;--sk-c1:#00798c;--sk-c2:#edae49;--sk-seq-lo:oklch(0.95 0.03 250);--sk-seq-hi:#003399;--sk-surface:#ffffff';

function frame(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:0;top:0;width:800px;height:600px';
  document.getElementById('map')!.append(el);
  return el;
}

function data(columns: Record<string, { values: ArrayLike<unknown>; label: string; fmt?: (v: unknown) => string }>, rows: number) {
  return { rows, role: (name: string) => (columns[name] ? [columns[name]] : []) };
}

/** Points in a grid around (0, 0): row i at a known place. */
function grid(n: number) {
  const lng = new Float64Array(n), lat = new Float64Array(n), v = new Float64Array(n);
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    lng[i] = -10 + (i % side) * (20 / side);
    lat[i] = -10 + Math.floor(i / side) * (20 / side);
    v[i] = i;
  }
  return { lng, lat, v };
}

let selection: Set<number> | null = null;
function ctxFor(el: HTMLElement, d: unknown, options: Record<string, unknown>) {
  return {
    el,
    width: 800,
    height: 600,
    options,
    data: d,
    selected: (row: number) => (selection ? selection.has(row) : null),
    api: { select: (row: number, additive?: boolean) => calls.push(['select', row, !!additive]), setFilters: (f: unknown[]) => calls.push(['setFilters', f]) },
  };
}

const state: { pointsEl?: HTMLDivElement; pointsData?: unknown } = {};

(window as any).host = {
  types: () => [...defs.keys()],
  defs: () => [...defs.values()].map((d) => ({ type: d.type, roles: d.roles.map((r) => r.name), selfInteractive: d.selfInteractive, limit: d.limit })),
  /** Renders a points visual of n rows (with `sel` selected) and waits until it has drawn. */
  async points(n: number, sel: number[] | null) {
    selection = sel ? new Set(sel) : null;
    const g = grid(n);
    state.pointsEl ??= frame();
    state.pointsData ??= data({ latitude: { values: g.lat, label: 'Lat' }, longitude: { values: g.lng, label: 'Lng' }, values: { values: g.v, label: 'Sales', fmt: (x) => `$${x}` } }, n);
    const draw = () => defs.get('smaltgl.points')!.render(ctxFor(state.pointsEl!, state.pointsData, { basemap: 'none', radius: 8 }));
    draw();
    for (let i = 0; i < 100 && !mod.visuals().length; i++) await new Promise((r) => setTimeout(r, 50));
    // smaltbi renders again when data or selection change; the latest render applies once the map is up.
    draw();
    await mod.visuals()[0].ready(5000);
    return mod.visuals().length;
  },
  /** Clicks the point of `row` (with Ctrl held) and returns what smaltbi was asked. */
  async clickRow(row: number) {
    const v = mod.visuals()[0];
    const g = grid(400);
    const wx = (g.lng[row] + 180) / 360;
    const s = Math.sin((g.lat[row] * Math.PI) / 180);
    const wy = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    const [x, y] = v.map.camera.worldToScreen(wx, wy);
    const r = v.map.canvas.getBoundingClientRect();
    v.map.canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + x, clientY: r.top + y, ctrlKey: true, bubbles: true }));
    v.map.canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + x, clientY: r.top + y, button: 0, bubbles: true }));
    for (let i = 0; i < 40 && !calls.length; i++) await new Promise((r) => setTimeout(r, 50));
    return calls.slice();
  },
  /** Takes the points frame out of the page, renders another visual, and says how many maps are alive. */
  async detach() {
    state.pointsEl!.parentElement!.removeChild(state.pointsEl!);
    const el = frame();
    const g = grid(400);
    defs.get('smaltgl.hexbin')!.render(ctxFor(el, data({ latitude: { values: g.lat, label: 'Lat' }, longitude: { values: g.lng, label: 'Lng' } }, 400), { basemap: 'none', cellSize: 200000 }));
    for (let i = 0; i < 100 && mod.visuals().length !== 1; i++) await new Promise((r) => setTimeout(r, 50));
    return mod.visuals().length;
  },
};
(window as any).ready = true;
export {};
