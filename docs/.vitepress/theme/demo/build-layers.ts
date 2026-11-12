// Layers for a dataset and a set of choices: the tech demo's core, as a plain function. Any app that has a dataset
// (src/datasets shapes) and settings can call it: it builds layers and returns them, and touches no page or state.
import type { AggregateLayer, GpuFilter, Layer, PathLayer, Projected } from '@smaltworks/smaltgl'
import type { Dataset, PolygonsDataset } from '@smaltworks/smaltgl/datasets'
import type { LayerKind } from '../demo-datasets'

type GL = typeof import('@smaltworks/smaltgl')

/** What to colour by: a column, and a ramp (or categories). */
export interface ColourChoice {
  readonly column: string
  readonly ramp: string
  readonly categorical?: boolean
}

export interface LayerSettings {
  readonly layer: LayerKind
  readonly colour: ColourChoice
  /** A column to filter by on the GPU, and its range. */
  readonly filter?: { readonly column: string; readonly range: readonly [number, number] }
  readonly radius: number
  readonly heatRadius: number
  readonly cellSize: number
  readonly measure: 'count' | 'mean' | 'sum'
  readonly width: number
  readonly opacity: number
  readonly additive: boolean
  readonly greatCircle: boolean
  readonly animate: boolean
  readonly extrude: boolean
  /** Multiplies 3D heights. */
  readonly height: number
}

export interface BuiltLayers {
  readonly layers: Layer[]
  /** A note for the reader (when some rows were left out). */
  readonly note: string
  /** The trips layer, when there is one: for playback. */
  readonly trips?: PathLayer
}

/** Projected positions of a dataset's points, worked out once per dataset (pass the same cache back). */
export function projectDataset(gl: GL, d: Dataset): Projected {
  if (d.kind === 'points') return gl.projectColumns(d.columns.lng, d.columns.lat)
  if (d.kind === 'arcs') return gl.projectColumns(d.columns.sourceLng, d.columns.sourceLat)
  return gl.projectColumns(d.points.lng, d.points.lat)
}

const colorSpec = (values: ArrayLike<number> | undefined, c: ColourChoice) =>
  values ? (c.categorical ? { values, categorical: true } : { values, ramp: c.ramp as 'smalt' }) : undefined

const filterOf = (values: ArrayLike<number> | undefined, s: LayerSettings): GpuFilter[] =>
  values && s.filter ? [{ values: values instanceof Float32Array ? values : Float32Array.from(values), range: [s.filter.range[0], s.filter.range[1]] }] : []

/** Metres across the data's extent, at its latitude. */
function spanMetres(p: Projected, lat: number): number {
  return Math.max(p.bounds[2] - p.bounds[0], p.bounds[3] - p.bounds[1]) * 40075016 * Math.cos((lat * Math.PI) / 180)
}

/** Column heights for cells: the top about a tenth of the data's extent, times the height setting. */
export const extrudeMetres = (p: Projected, lat: number, height: number): number => Math.max(200, spanMetres(p, lat) * 0.12) * height

/** A polygon height scale: the largest value stands about a tenth of the area's width tall. */
export function polygonScale(values: ArrayLike<number>, p: Projected, lat: number, height: number): number {
  let mx = 0
  for (let i = 0; i < values.length; i++) if (values[i] > mx) mx = values[i]
  return ((spanMetres(p, lat) * 0.1) / Math.max(1e-9, mx)) * height
}

/**
 * The layers for `data` with settings `s`. `points` is the dataset's projected positions (projectDataset), `lat` the
 * latitude heights are measured at. Every layer the demo shows comes from here, with the id 'data' (airports and
 * graph nodes ride along under their own ids).
 */
export function buildLayers(gl: GL, data: Dataset, s: LayerSettings, points: Projected, lat: number): BuiltLayers {
  const out: Layer[] = []
  const id = 'data'
  const cb = s.colour
  let note = ''
  let tripsLayer: PathLayer | undefined
  const d = data
  if (d.kind === 'points' || (d.kind === 'paths' && s.layer !== 'trips' && s.layer !== 'paths')) {
    const cols = d.kind === 'points' ? (d.columns as Record<string, ArrayLike<number>>) : undefined
    const color = cols ? colorSpec(cols[cb.column], cb) : undefined
    const filterValues = cols && s.filter ? cols[s.filter.column] : undefined
    const filters = filterOf(filterValues, s)
    const props = cols ? Object.fromEntries(Object.entries(cols).filter(([k]) => !/lng|lat/i.test(k))) : undefined
    if (s.layer === 'scatter') out.push(gl.scatter({ id, data: points, color: color ?? '#5CBDE8', radius: s.radius, opacity: s.opacity, additive: s.additive, filters, properties: props }))
    else if (s.layer === 'heatmap') out.push(gl.heatmap({ id, data: points, radius: s.heatRadius, opacity: s.opacity, filters }))
    else if (s.layer === 'hexbin' || s.layer === 'grid') {
      const weight = s.measure !== 'count' && cols ? cols[cb.column] : undefined
      const make = s.layer === 'hexbin' ? gl.hexbin : gl.grid
      out.push(make({ id, data: points, cellSize: s.cellSize, weight, measure: weight ? s.measure : 'count', ramp: (cb.categorical ? 'smalt' : cb.ramp) as 'smalt', opacity: s.opacity, filters, scale: s.measure === 'count' ? 'log' : 'linear', extrude: s.extrude ? extrudeMetres(points, lat, s.height) : 0 }))
    } else if (s.layer === 'arcs' && cols?.dropLng) {
      const n = Math.min(d.count, 300_000)
      if (d.count > n) note = `Arcs: the first ${n.toLocaleString('en-US')} rides`
      const sl = (c: ArrayLike<number>) => (c as Float64Array).subarray(0, n)
      out.push(
        gl.arcs({
          id,
          data: { sourceLng: sl(cols.lng), sourceLat: sl(cols.lat), targetLng: sl(cols.dropLng), targetLat: sl(cols.dropLat) },
          color: color ? ({ ...(color as object), values: sl(cols[cb.column]) } as never) : '#0E7FAE',
          width: s.width,
          opacity: s.opacity * 0.6,
          additive: s.additive,
          animate: s.animate,
          height: 0.3,
          filters: filterValues && s.filter ? [{ values: Float32Array.from(sl(filterValues)), range: [s.filter.range[0], s.filter.range[1]] }] : [],
        }),
      )
    }
  } else if (d.kind === 'arcs') {
    const c = d.columns as Record<string, Float64Array | Float32Array>
    const filterValues = s.filter ? c[s.filter.column] : undefined
    const props = { distance: c.distance, seats: c.seats, hour: c.hour }
    if (s.layer === 'arcs') {
      out.push(gl.arcs({ id, data: d.columns as never, color: colorSpec(c[cb.column], cb) as never, width: s.width, opacity: s.opacity, additive: s.additive, greatCircle: s.greatCircle, animate: s.animate, filters: filterOf(filterValues, s), properties: props }))
      if (d.places) {
        const pl = d.places
        out.push(gl.scatter({ id: 'airports', data: { lng: pl.lng, lat: pl.lat }, color: '#FFFFFF', radius: 2, size: { values: pl.weight }, radiusMax: 9, opacity: 0.9, stroke: { color: '#0E7FAE', width: 1 }, properties: { airport: pl.names, flights: pl.weight } }))
      }
    } else {
      const p = gl.projectColumns(c.targetLng, c.targetLat)
      if (s.layer === 'heatmap') out.push(gl.heatmap({ id, data: p, radius: s.heatRadius, filters: filterOf(filterValues, s) }))
      else out.push(gl.scatter({ id, data: p, radius: s.radius, color: colorSpec(c[cb.column], cb) as never, additive: s.additive, opacity: s.opacity, filters: filterOf(filterValues, s), properties: props }))
    }
  } else if (d.kind === 'paths') {
    const c = d.columns as Record<string, ArrayLike<number>>
    const color = colorSpec(c[cb.column], cb) ?? '#E5622F'
    const props = c.vehicle
      ? { vehicle: Array.from(c.vehicle, (v) => ['Van', 'Cargo bike', 'Truck'][v]), stops: c.stops, km: Array.from(c.distance, (v) => Math.round(v * 10) / 10) }
      : ((d as { properties?: Record<string, ArrayLike<unknown>> }).properties ?? c)
    if (s.layer === 'trips') {
      tripsLayer = gl.trips({ id, data: { starts: d.starts, lng: d.points.lng, lat: d.points.lat, times: d.points.times }, color: color as never, width: s.width + 0.8, opacity: s.opacity, additive: s.additive, trail: 1800, time: 9 * 3600, properties: props })
      out.push(tripsLayer)
    } else out.push(gl.paths({ id, data: { starts: d.starts, lng: d.points.lng, lat: d.points.lat }, color: color as never, width: s.width, opacity: s.opacity * 0.7, additive: s.additive, properties: props }))
  } else if (d.kind === 'polygons') {
    const c = d.columns as Record<string, ArrayLike<number>>
    const filterValues = s.filter ? c[s.filter.column] : undefined
    const rings = (d as PolygonsDataset & { rings?: Uint32Array }).rings
    const props = c.density
      ? { population: c.population, density: Array.from(c.density, Math.round), income: c.income, commute: Array.from(c.commute, Math.round) }
      : ((d as { properties?: Record<string, ArrayLike<unknown>> }).properties ?? c)
    const hv = c[cb.column]
    const extrude = s.extrude && hv ? { values: hv, scale: polygonScale(hv, points, lat, s.height) } : undefined
    out.push(gl.polygons({ id, extrude, data: { starts: d.starts, lng: d.points.lng, lat: d.points.lat, rings }, color: (colorSpec(hv, cb) ?? '#2F5BB7') as never, opacity: s.opacity, filters: filterOf(filterValues, s), properties: props }))
  }
  return { layers: out, note, trips: tripsLayer }
}

/** A legend for the main layer: a ramp and its domain, or categories. */
export interface Legend {
  readonly stops: string[]
  readonly domain: [number, number]
  readonly categories?: string[]
}

export function legendFor(gl: GL, layer: Layer | undefined, categories?: readonly string[]): Legend | null {
  const l = layer as (Layer & { legend?: { stops: readonly string[]; domain: readonly [number, number]; categorical: boolean }; rampStops?: readonly string[] }) | undefined
  if (!l) return null
  if (l.rampStops) return { stops: [...l.rampStops], domain: [0, (l as unknown as AggregateLayer).max ?? 1] }
  if (l.legend?.categorical) return { stops: [...gl.CATEGORICAL], domain: [0, 0], categories: categories ? [...categories] : undefined }
  if (l.legend) return { stops: [...l.legend.stops], domain: [l.legend.domain[0], l.legend.domain[1]] }
  return null
}
