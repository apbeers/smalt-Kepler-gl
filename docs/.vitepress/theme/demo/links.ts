// The demo's state as a link and back: plain functions, so another page can make links into the demo (or read them).
export interface LinkState {
  readonly dataset: string
  readonly sizeIndex: number
  readonly layer: string
  readonly color?: string
  readonly filter?: { readonly column: string; readonly range: readonly [number, number] }
  readonly extrude?: boolean
  readonly theme?: string
  readonly view?: { readonly center: readonly [number, number]; readonly zoom: number; readonly bearing?: number; readonly pitch?: number }
}

/** The query string for a state (without the leading ?). */
export function encodeLink(st: LinkState): string {
  const p = new URLSearchParams()
  p.set('dataset', st.dataset)
  p.set('size', String(Math.max(0, st.sizeIndex)))
  p.set('layer', st.layer)
  if (st.color) p.set('color', st.color)
  if (st.filter) {
    p.set('filter', st.filter.column)
    p.set('range', `${+st.filter.range[0].toFixed(3)},${+st.filter.range[1].toFixed(3)}`)
  }
  if (st.extrude) p.set('3d', '1')
  if (st.theme) p.set('theme', st.theme)
  const v = st.view
  if (v) p.set('view', [v.center[0].toFixed(4), v.center[1].toFixed(4), v.zoom.toFixed(2), Math.round(v.bearing ?? 0), Math.round(v.pitch ?? 0)].join(','))
  return p.toString()
}

/** What a link asks for; fields it doesn't set are left out. */
export function decodeLink(q: URLSearchParams): Partial<LinkState> {
  const out: { -readonly [K in keyof LinkState]?: LinkState[K] } = {}
  if (q.get('dataset')) out.dataset = q.get('dataset')!
  if (q.get('size')) out.sizeIndex = Number(q.get('size'))
  if (q.get('layer')) out.layer = q.get('layer')!
  if (q.get('color')) out.color = q.get('color')!
  const [lo, hi] = (q.get('range') ?? '').split(',').map(Number)
  if (q.get('filter')) out.filter = { column: q.get('filter')!, range: [Number.isFinite(lo) ? lo : -Infinity, Number.isFinite(hi) ? hi : Infinity] }
  if (q.get('3d') === '1') out.extrude = true
  if (q.get('theme')) out.theme = q.get('theme')!
  const v = (q.get('view') ?? '').split(',').map(Number)
  if (v.length >= 3 && v.every(Number.isFinite)) out.view = { center: [v[0], v[1]], zoom: v[2], bearing: v[3] ?? 0, pitch: v[4] ?? 0 }
  return out
}
