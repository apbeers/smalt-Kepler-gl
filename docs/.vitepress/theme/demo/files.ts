// A dropped GeoJSON file as a dataset the demo (or any app using buildLayers) can draw: the kind of geometry most of
// the file is, its numeric properties as colour and filter columns, and text properties as categories.
import type { Dataset } from '@smaltworks/smaltgl/datasets'
import type { DemoDataset } from '../demo-datasets'

type GL = typeof import('@smaltworks/smaltgl')

export interface FileDataset {
  readonly data: Dataset
  readonly count: number
  /** The layers, colours and filters its columns allow. */
  readonly meta: Pick<DemoDataset, 'layers' | 'colorBy' | 'filters'>
}

export function datasetFromGeoJSON(gl: GL, text: string): FileDataset {
  const g = gl.readGeoJSON(text)
  const kind = g.polygons.count >= Math.max(g.lines.count, g.points.count) ? 'polygons' : g.lines.count >= g.points.count ? 'lines' : 'points'
  const part = g[kind]
  const columns: Record<string, Float32Array> = {}
  const colorBy: DemoDataset['colorBy'][number][] = []
  for (const [k, v] of Object.entries(part.columns))
    if (v instanceof Float64Array) {
      columns[k] = Float32Array.from(v)
      colorBy.push({ column: k, ramp: 'glow' })
    }
  for (const [k, c] of Object.entries(part.categories))
    if (c.names.length <= 64) {
      columns[k] = c.codes
      colorBy.push({ column: k, ramp: 'categorical', categorical: true })
    }
  const properties = part.columns
  let data: Dataset
  if (kind === 'polygons') {
    const p = g.polygons
    data = { kind: 'polygons', count: p.count, starts: p.starts, rings: p.rings, points: { lng: p.lng, lat: p.lat }, columns, properties } as never
  } else if (kind === 'lines') {
    const l = g.lines
    data = { kind: 'paths', count: l.count, starts: l.starts, points: { lng: l.lng, lat: l.lat, times: new Float64Array(l.lng.length) }, columns, properties } as never
  } else data = { kind: 'points', count: g.points.count, columns: { lng: g.points.lng, lat: g.points.lat, ...columns } } as never
  return {
    data,
    count: part.count,
    meta: {
      layers: kind === 'polygons' ? ['polygons'] : kind === 'lines' ? ['paths'] : ['scatter', 'heatmap', 'hexbin', 'grid'],
      colorBy: colorBy.length ? colorBy : [{ column: '', ramp: 'glow' }],
      filters: colorBy.filter((c) => !c.categorical).map((c) => ({ column: c.column, label: c.column })),
    },
  }
}
