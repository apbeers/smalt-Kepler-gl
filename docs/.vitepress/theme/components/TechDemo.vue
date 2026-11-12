<script setup lang="ts">
// The tech demo: generated datasets from thousands to millions of rows, every layer and option, GPU filters and
// playback, and the numbers for each step, measured on the visitor's machine.
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import type { SmaltMap, Basemap, Layer, GpuFilter, Projected, ScatterLayer, HeatmapLayer, AggregateLayer, ArcLayer, PathLayer, PolygonLayer } from '@smaltworks/smaltgl'
import type { Dataset, PointsDataset, ArcsDataset, PathsDataset, PolygonsDataset } from '@smaltworks/smaltgl/datasets'
import { DEMO_DATASETS, SQL_PRESETS, CYPHER_PRESETS, type DemoDataset, type LayerKind } from '../demo-datasets'

type GL = typeof import('@smaltworks/smaltgl')
let gl: GL
let map: SmaltMap | undefined
let base: Basemap | undefined
const host = ref<HTMLElement>()
const error = ref('')
const busy = ref('')
const gpuMissing = ref(false)

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const first = DEMO_DATASETS.find((d) => d.id === q.get('dataset')) ?? DEMO_DATASETS[0]

const s = reactive({
  dataset: first.id,
  size: first.sizes[Number(q.get('size') ?? first.start)] ?? first.sizes[first.start],
  layer: first.layers[0] as LayerKind,
  colorBy: first.colorBy[0].column,
  radius: first.radius ?? 2,
  heatRadius: 18,
  cellSize: first.cellSize ?? 500,
  measure: 'count' as 'count' | 'mean' | 'sum',
  pitch: 0,
  extrude: false,
  height: 1,
  width: 1.2,
  opacity: first.opacity ?? 0.85,
  additive: true,
  greatCircle: true,
  animate: true,
  theme: first.theme as 'light' | 'dark' | 'none',
  filter: '',
  lo: 0,
  hi: 1,
  min: 0,
  max: 1,
  playing: false,
  speed: 1,
  sql: SQL_PRESETS[0].sql,
  cypher: CYPHER_PRESETS[0].cypher,
})

/** For your own file: the layers, colours and filters its columns allow (found when it loads). */
const fileMeta = shallowRef<Pick<DemoDataset, 'layers' | 'colorBy' | 'filters'> | null>(null)
const fileName = ref('')
const fileKind = ref<'' | 'csv' | 'geojson'>('')
const ds = computed<DemoDataset>(() => {
  const d = DEMO_DATASETS.find((x) => x.id === s.dataset)!
  return d.source === 'file' && fileMeta.value ? { ...d, ...fileMeta.value } : d
})
const filterDef = computed(() => ds.value.filters.find((f) => f.column === s.filter))
const fmtN = (n: number) => n.toLocaleString('en-US')
const fmtMs = (n?: number) => (n === undefined ? '–' : n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US'))

const stats = reactive({ generate: undefined as number | undefined, build: undefined as number | undefined, query: undefined as number | undefined, load: undefined as number | undefined, rows: 0, fps: 0, cpu: 0, gpu: undefined as number | undefined, objects: 0, bench: '' })
const legend = shallowRef<{ stops: string[]; domain: [number, number]; categories?: string[] } | null>(null)
const tooltipNote = ref('')

// The data, kept out of Vue's reactivity: millions of numbers.
let data: Dataset | undefined
let projected: Projected | undefined
let layers: Layer[] = []
let db: { query: Function; exec: Function; importCSV: Function } | undefined
let dbRows = 0
let graph: { query: Function; load: Function } | undefined
let graphSize = 0

// ---------------------------------------------------------------------------------------------------------------------

onMounted(async () => {
  try {
    gl = await import('@smaltworks/smaltgl')
    base = gl.basemap({ theme: s.theme === 'none' ? 'light' : s.theme })
    map = await gl.createMap(host.value!, { center: ds.value.view.center as [number, number], zoom: ds.value.view.zoom, basemap: s.theme === 'none' ? null : base })
    let last = 0
    map.on('move', (v) => {
      if (Math.abs((v.pitch ?? 0) - s.pitch) > 0.5) s.pitch = v.pitch ?? 0
    })
    map.on('frame', (f) => {
      const now = performance.now()
      if (now - last < 200) return
      last = now
      stats.fps = f.fps
      stats.cpu = f.cpuMs
      stats.gpu = f.gpuMs
      stats.objects = f.objects
    })
    ;(window as unknown as { demo: unknown }).demo = { map, state: s, stats, load, select, ready: () => !busy.value }
    await load()
  } catch (e) {
    if ((e as Error)?.name === 'GpuUnavailableError') gpuMissing.value = true
    else error.value = String((e as Error)?.message ?? e)
  }
})

onBeforeUnmount(() => {
  s.playing = false
  map?.destroy()
})

// ---------------------------------------------------------------------------------------------------------------------
// Loading

async function load(): Promise<void> {
  if (!map) return
  error.value = ''
  s.playing = false
  const d = ds.value
  try {
    if (d.source === 'smaltdb' || (d.source === 'file' && fileKind.value === 'csv')) return await runSql()
    if (d.source === 'file') {
      if (fileKind.value) return await build()
      layers = []
      map.setLayers([])
      legend.value = null
      return
    }
    if (d.source === 'smaltcy') return await runCypher()
    busy.value = `Generating ${fmtN(s.size)} rows…`
    const { generate } = await import('@smaltworks/smaltgl/datasets')
    const t0 = performance.now()
    const r = await generate(d.source, s.size)
    stats.generate = performance.now() - t0
    stats.query = undefined
    stats.load = undefined
    data = r.dataset as Dataset
    projected = undefined
    stats.rows = data.kind === 'paths' ? data.points.lng.length : data.count
    await build()
  } catch (e) {
    error.value = String((e as Error)?.message ?? e)
  } finally {
    busy.value = ''
  }
}

function points(): Projected {
  if (projected) return projected
  const d = data!
  if (d.kind === 'points') projected = gl.projectColumns(d.columns.lng, d.columns.lat)
  else if (d.kind === 'arcs') projected = gl.projectColumns(d.columns.sourceLng, d.columns.sourceLat)
  else if (d.kind === 'paths' || d.kind === 'polygons') projected = gl.projectColumns(d.points.lng, d.points.lat)
  return projected!
}

function colorSpec(values: ArrayLike<number> | undefined, categorical: boolean, ramp: string) {
  if (!values) return undefined
  return categorical ? { values, categorical: true } : { values, ramp: ramp as 'smalt' }
}

function gpuFilter(values: ArrayLike<number> | undefined): GpuFilter[] {
  if (!values || !s.filter) return []
  return [{ values: values instanceof Float32Array ? values : Float32Array.from(values), range: [s.lo, s.hi] }]
}

function setFilterDomain(values: ArrayLike<number> | undefined): void {
  if (!values || !values.length) return
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  s.min = Math.floor(lo)
  s.max = Math.ceil(hi)
  s.lo = s.min
  s.hi = s.max
}

/** Builds the layers for the current data and settings, and times the upload and the first frame. */
async function build(): Promise<void> {
  if (!map || !data) return
  const t0 = performance.now()
  const d = data
  const cb = ds.value.colorBy.find((c) => c.column === s.colorBy) ?? ds.value.colorBy[0]
  const out: Layer[] = []
  const id = 'data'
  let filterValues: ArrayLike<number> | undefined
  if (d.kind === 'points' || (d.kind === 'paths' && s.layer !== 'trips' && s.layer !== 'paths')) {
    const cols = d.kind === 'points' ? d.columns : undefined
    const color = cols ? colorSpec(cols[cb.column], !!cb.categorical, cb.ramp) : undefined
    filterValues = cols && s.filter ? cols[s.filter] : undefined
    const filters = gpuFilter(filterValues)
    const props = cols ? Object.fromEntries(Object.entries(cols).filter(([k]) => !/lng|lat/i.test(k))) : undefined
    if (s.layer === 'scatter') out.push(gl.scatter({ id, data: points(), color: color ?? '#5CBDE8', radius: s.radius, opacity: s.opacity, additive: s.additive, filters, properties: props }))
    else if (s.layer === 'heatmap') out.push(gl.heatmap({ id, data: points(), radius: s.heatRadius, opacity: s.opacity, filters }))
    else if (s.layer === 'hexbin' || s.layer === 'grid') {
      const weight = s.measure !== 'count' && cols ? cols[cb.column] : undefined
      const make = s.layer === 'hexbin' ? gl.hexbin : gl.grid
      out.push(make({ id, data: points(), cellSize: s.cellSize, weight, measure: weight ? s.measure : 'count', ramp: (cb.categorical ? 'smalt' : cb.ramp) as 'smalt', opacity: s.opacity, filters, scale: s.measure === 'count' ? 'log' : 'linear', extrude: s.extrude ? extrudeMetres() : 0 }))
    } else if (s.layer === 'arcs' && cols?.dropLng) {
      const n = Math.min(d.count, 300_000)
      tooltipNote.value = d.count > n ? `Arcs: the first ${fmtN(n)} rides` : ''
      const sl = (c: ArrayLike<number>) => (c as Float64Array).subarray(0, n)
      out.push(
        gl.arcs({
          id,
          data: { sourceLng: sl(cols.lng), sourceLat: sl(cols.lat), targetLng: sl(cols.dropLng), targetLat: sl(cols.dropLat) },
          color: color ? { ...(color as object), values: sl(cols[cb.column]) } as never : '#0E7FAE',
          width: s.width,
          opacity: s.opacity * 0.6,
          additive: s.additive,
          animate: s.animate,
          height: 0.3,
          filters: filterValues ? [{ values: Float32Array.from(sl(filterValues)), range: [s.lo, s.hi] }] : [],
        }),
      )
    }
  } else if (d.kind === 'arcs') {
    const c = d.columns
    filterValues = s.filter ? c[s.filter] : undefined
    const props = { distance: c.distance, seats: c.seats, hour: c.hour }
    if (s.layer === 'arcs') {
      out.push(gl.arcs({ id, data: c, color: colorSpec(c[cb.column], !!cb.categorical, cb.ramp) as never, width: s.width, opacity: s.opacity, additive: s.additive, greatCircle: s.greatCircle, animate: s.animate, filters: gpuFilter(filterValues), properties: props }))
    } else if (s.layer === 'scatter' || s.layer === 'heatmap') {
      const p = gl.projectColumns(c.targetLng, c.targetLat)
      if (s.layer === 'heatmap') out.push(gl.heatmap({ id, data: p, radius: s.heatRadius, filters: gpuFilter(filterValues) }))
      else out.push(gl.scatter({ id, data: p, radius: s.radius, color: colorSpec(c[cb.column], !!cb.categorical, cb.ramp) as never, additive: s.additive, opacity: s.opacity, filters: gpuFilter(filterValues), properties: props }))
    }
    if (d.places && s.layer === 'arcs') {
      const pl = d.places
      out.push(gl.scatter({ id: 'airports', data: { lng: pl.lng, lat: pl.lat }, color: '#FFFFFF', radius: 2, size: { values: pl.weight }, radiusMax: 9, opacity: 0.9, stroke: { color: '#0E7FAE', width: 1 }, properties: { airport: pl.names, flights: pl.weight } }))
    }
  } else if (d.kind === 'paths') {
    const c = d.columns
    const color = colorSpec(c[cb.column], !!cb.categorical, cb.ramp) ?? '#E5622F'
    const pd = { starts: d.starts, lng: d.points.lng, lat: d.points.lat, times: d.points.times }
    const props = c.vehicle ? { vehicle: Array.from(c.vehicle, (v) => ['Van', 'Cargo bike', 'Truck'][v]), stops: c.stops, km: Array.from(c.distance, (v) => Math.round(v * 10) / 10) } : (d as { properties?: Record<string, ArrayLike<unknown>> }).properties ?? c
    if (s.layer === 'trips') {
      const t = gl.trips({ id, data: pd, color: color as never, width: s.width + 0.8, opacity: s.opacity, additive: s.additive, trail: 1800, time: 9 * 3600, properties: props })
      t.onTime = (time) => (clock.value = time)
      out.push(t)
      s.min = t.timeRange[0]
      s.max = t.timeRange[1]
      clock.value = 9 * 3600
    } else out.push(gl.paths({ id, data: { starts: d.starts, lng: d.points.lng, lat: d.points.lat }, color: color as never, width: s.width, opacity: s.opacity * 0.7, additive: s.additive, properties: props }))
  } else if (d.kind === 'polygons') {
    const c = d.columns
    filterValues = s.filter ? c[s.filter] : undefined
    const rings = (d as PolygonsDataset & { rings?: Uint32Array }).rings
    const props = c.density ? { population: c.population, density: Array.from(c.density, Math.round), income: c.income, commute: Array.from(c.commute, Math.round) } : (d as { properties?: Record<string, ArrayLike<unknown>> }).properties ?? c
    const hv = c[cb.column]
    const extrude = s.extrude && hv ? { values: hv, scale: polygonScale(hv) } : undefined
    out.push(gl.polygons({ id, extrude, data: { starts: d.starts, lng: d.points.lng, lat: d.points.lat, rings }, color: (colorSpec(c[cb.column], !!cb.categorical, cb.ramp) ?? '#2F5BB7') as never, opacity: s.opacity, filters: gpuFilter(filterValues), properties: props }))
  }
  layers = out
  map.setLayers(out)
  await map.renderNow()
  stats.build = performance.now() - t0
  updateLegend(cb)
}

/** Column heights for the cells: about a tenth of the data's extent at the top, times the height slider. */
function extrudeMetres(): number {
  const p = points()
  const span = Math.max(p.bounds[2] - p.bounds[0], p.bounds[3] - p.bounds[1]) * 40075016 * Math.cos((ds.value.view.center[1] * Math.PI) / 180)
  return Math.max(200, span * 0.12) * s.height
}

/** Polygon heights: the largest value stands about as tall as a tenth of the area's width. */
function polygonScale(values: ArrayLike<number>): number {
  let mx = 0
  for (let i = 0; i < values.length; i++) if (values[i] > mx) mx = values[i]
  const p = points()
  const span = Math.max(p.bounds[2] - p.bounds[0], p.bounds[3] - p.bounds[1]) * 40075016 * Math.cos((ds.value.view.center[1] * Math.PI) / 180)
  return ((span * 0.1) / Math.max(1e-9, mx)) * s.height
}

function updateLegend(cb: { column: string; ramp: string; categorical?: boolean }): void {
  const l = layers.find((x) => x.id === 'data') as (Layer & { legend?: { stops: readonly string[]; domain: readonly [number, number]; categorical: boolean }; rampStops?: readonly string[] }) | undefined
  if (!l) return (legend.value = null)
  const d = data
  const cats = d && 'categories' in d ? d.categories?.[cb.column] : undefined
  if (l.rampStops) {
    const agg = l as unknown as AggregateLayer
    legend.value = { stops: [...l.rampStops], domain: [0, agg.max ?? 1] }
    if ('max' in agg) setTimeout(() => (legend.value = { stops: [...l.rampStops!], domain: [0, agg.max] }), 300)
  } else if (l.legend) {
    if (l.legend.categorical) legend.value = { stops: [...gl.CATEGORICAL], domain: [0, 0], categories: cats ? [...cats] : undefined }
    else legend.value = { stops: [...l.legend.stops], domain: [l.legend.domain[0], l.legend.domain[1]] }
  } else legend.value = null
}

// ---------------------------------------------------------------------------------------------------------------------
// smaltdb and smaltcy

async function runSql(): Promise<void> {
  if (!map) return
  busy.value = 'Starting smaltdb…'
  try {
    if (!db) {
      const smaltdb = await import('smaltdb')
      db = (await smaltdb.open('smaltgl-demo', { storage: 'memory' })) as never
    }
    if (ds.value.source === 'smaltdb' && dbRows !== s.size) {
      busy.value = `Generating and loading ${fmtN(s.size)} rides into smaltdb…`
      const { generate } = await import('@smaltworks/smaltgl/datasets')
      const t0 = performance.now()
      const { dataset } = await generate('rides', s.size)
      stats.generate = performance.now() - t0
      const c = dataset.columns
      const r = await gl.loadSmaltdb(db as never, 'rides', { lng: c.lng, lat: c.lat, hour: c.hour, fare: c.fare, distance: c.distance, passengers: c.passengers, dropLng: c.dropLng, dropLat: c.dropLat })
      stats.load = r.ms
      dbRows = s.size
    }
    busy.value = 'Running the query…'
    const res = await gl.querySmaltdb(db as never, s.sql)
    stats.query = res.ms
    stats.rows = res.count
    const col = (name: string) => {
      const k = Object.keys(res.columns).find((x) => x.toLowerCase() === name.toLowerCase())
      return k ? gl.numeric(res.columns[k]) : undefined
    }
    const coords = gl.findCoordinates(Object.keys(res.columns))
    const lng = col(coords.lng ?? 'lng'), lat = col(coords.lat ?? 'lat')
    if (!lng || !lat) throw new Error('The query must return longitude and latitude columns (named lng and lat, or longitude and latitude).')
    const columns: Record<string, Float64Array> = { lng, lat }
    // Every other numeric column can colour and filter.
    for (const k of Object.keys(res.columns)) {
      if (k === coords.lng || k === coords.lat) continue
      const v = res.columns[k]
      if (v instanceof Float64Array || (v as unknown[]).every?.((x) => typeof x === 'number' || x === null)) columns[k] = gl.numeric(v)
    }
    if (ds.value.source === 'file') {
      const numeric = Object.keys(columns).filter((k) => k !== 'lng' && k !== 'lat')
      fileMeta.value = {
        layers: ['scatter', 'heatmap', 'hexbin', 'grid'],
        colorBy: numeric.length ? numeric.map((c) => ({ column: c, ramp: 'glow' })) : [{ column: '', ramp: 'glow' }],
        filters: numeric.map((c) => ({ column: c, label: c })),
      }
      if (!numeric.includes(s.colorBy)) s.colorBy = numeric[0] ?? ''
    }
    const dl = col('dropLng'), dt = col('dropLat')
    if (dl && dt) {
      columns.dropLng = dl
      columns.dropLat = dt
    }
    data = { kind: 'points', count: res.count, columns } as PointsDataset
    projected = undefined
    if (ds.value.source === 'file') map.fitBounds()
    if (s.layer === 'arcs' && !dl) throw new Error('Arcs need dropLng and dropLat columns: try "Long trips as arcs".')
    await build()
  } catch (e) {
    error.value = String((e as Error)?.message ?? e)
  } finally {
    busy.value = ''
  }
}

async function runCypher(): Promise<void> {
  if (!map) return
  busy.value = 'Starting smaltcy…'
  try {
    if (!graph || graphSize !== s.size) {
      const smaltcy = await import('@smaltworks/smaltcy')
      const { supplyChain } = await import('@smaltworks/smaltgl/datasets')
      const t0 = performance.now()
      graph = smaltcy.open() as never
      graph!.load(gl.supplyChainJSON(supplyChain(s.size)))
      stats.load = performance.now() - t0
      stats.generate = undefined
      graphSize = s.size
    }
    const t0 = performance.now()
    const m = gl.graphLayers(graph as never, s.cypher)
    stats.query = performance.now() - t0
    stats.rows = m.nodes.count + m.edges.count
    const t1 = performance.now()
    const kinds = ['#E5622F', '#B0249F', '#0E7FAE', '#9ACD4A']
    const arcLayer = gl.arcs({
      id: 'data',
      data: m.edges,
      color: { values: m.edges.type, categorical: true },
      width: s.width + 0.5,
      opacity: s.opacity,
      greatCircle: s.greatCircle,
      animate: s.animate,
      additive: s.additive,
      properties: m.edges.properties,
    })
    const nodeLayer = gl.scatter({
      id: 'nodes',
      data: { lng: m.nodes.lng, lat: m.nodes.lat },
      color: { values: m.nodes.label, categorical: true },
      radius: s.radius,
      stroke: { width: 1 },
      properties: { label: Array.from(m.nodes.label, (i) => m.nodes.labels[i]), ...m.nodes.properties },
    })
    layers = [arcLayer, nodeLayer]
    map.setLayers(layers)
    await map.renderNow()
    stats.build = performance.now() - t1
    legend.value = { stops: [...gl.CATEGORICAL], domain: [0, 0], categories: m.edges.types.length ? [...m.edges.types] : [...m.nodes.labels] }
    void kinds
  } catch (e) {
    error.value = String((e as Error)?.message ?? e)
  } finally {
    busy.value = ''
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Reacting to the controls

// A new dataset resets the settings to its own, at once (before the load below sees the change).
let nextSize: number | undefined
watch(
  () => s.dataset,
  () => {
    const d = ds.value
    s.size = d.sizes[nextSize ?? d.start] ?? d.sizes[d.start]
    nextSize = undefined
    s.layer = d.layers[0]
    s.colorBy = d.colorBy[0].column
    s.filter = ''
    s.radius = d.radius ?? 2
    s.cellSize = d.cellSize ?? 500
    s.opacity = d.opacity ?? 0.85
    s.measure = 'count'
    s.extrude = false
    s.pitch = 0
    tooltipNote.value = ''
    setTheme(d.theme)
    map?.setView({ center: d.view.center as [number, number], zoom: d.view.zoom, bearing: 0 })
  },
  { flush: 'sync' },
)
watch(() => [s.dataset, s.size], () => void load())
/** Picks a dataset and the index of its size in one step (for links and tests). */
function select(id: string, sizeIndex?: number): void {
  nextSize = sizeIndex
  if (s.dataset === id) {
    const d = ds.value
    s.size = d.sizes[sizeIndex ?? d.start]
  } else s.dataset = id
}
// Rebuilds: anything that changes what is uploaded.
watch(() => s.pitch, (p) => map?.setView({ pitch: p }))
watch(() => s.extrude, (on) => {
  if (on && s.pitch < 20) s.pitch = 45
})
watch(() => s.height, () => {
  const l = layers.find((x) => x.id === 'data') as unknown as { update?: (c: Record<string, unknown>) => void } | undefined
  if (s.layer === 'hexbin' || s.layer === 'grid') l?.update?.({ extrude: s.extrude ? extrudeMetres() : 0 })
  else if (s.layer === 'polygons' && s.extrude) void build()
})
watch(() => [s.layer, s.colorBy, s.additive, s.filter, s.measure, s.greatCircle, s.extrude], () => {
  if (s.filter) {
    const d = data
    const cols = d && d.kind !== 'paths' ? (d.columns as Record<string, ArrayLike<number>>) : undefined
    setFilterDomain(cols?.[s.filter])
  }
  if (ds.value.source === 'smaltcy') void runCypher()
  else if (ds.value.source === 'smaltdb' && s.layer === 'arcs' && !(data as PointsDataset | undefined)?.columns.dropLng) {
    // Arcs need the drop-off columns: switch to the query that returns them.
    s.sql = SQL_PRESETS.find((p) => /dropLng/.test(p.sql))!.sql
    void runSql()
  } else void build()
})
// Cheap changes: uniforms only.
watch(() => [s.radius, s.heatRadius, s.opacity, s.width, s.cellSize, s.animate], () => {
  for (const l of layers) {
    if (l.id !== 'data') continue
    const u = l as unknown as { update?: (c: Record<string, unknown>) => void }
    if (s.layer === 'scatter') u.update?.({ radius: s.radius, opacity: s.opacity })
    else if (s.layer === 'heatmap') u.update?.({ radius: s.heatRadius, opacity: s.opacity })
    else if (s.layer === 'hexbin' || s.layer === 'grid') u.update?.({ cellSize: s.cellSize, opacity: s.opacity })
    else if (s.layer === 'arcs') u.update?.({ width: s.width, opacity: s.opacity, animate: s.animate })
    else if (s.layer === 'trips' || s.layer === 'paths') u.update?.({ width: s.width + (s.layer === 'trips' ? 0.8 : 0), opacity: s.opacity })
    else if (s.layer === 'polygons') u.update?.({ opacity: s.opacity })
  }
  if (s.layer === 'hexbin' || s.layer === 'grid') setTimeout(() => updateLegend(ds.value.colorBy.find((c) => c.column === s.colorBy)!), 50)
})
watch(() => [s.lo, s.hi], () => {
  if (s.lo > s.hi) [s.lo, s.hi] = [s.hi, s.lo]
  for (const l of layers) (l as unknown as { setFilter?: (i: number, r: [number, number]) => void }).setFilter?.(0, [s.lo, s.hi])
})
watch(() => s.theme, (t) => setTheme(t))

function setTheme(t: 'light' | 'dark' | 'none'): void {
  s.theme = t
  if (!map) return
  if (t === 'none') {
    // The map destroys the basemap it lets go of.
    map.setBasemap(null)
    base = undefined
  } else {
    if (base) base.setTheme(t)
    else base = gl.basemap({ theme: t })
    map.setBasemap(base)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Playback

const clock = ref(0)
const clockText = computed(() => {
  const t = clock.value
  if (ds.value.id === 'fleet') return `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`
  return ''
})
let playFrame = 0
watch(() => s.playing, (on) => {
  cancelAnimationFrame(playFrame)
  const trip = layers.find((l) => l.id === 'data') as PathLayer | undefined
  if (s.layer === 'trips' && trip && 'play' in trip) {
    if (on) trip.play(600 * s.speed)
    else trip.pause()
    return
  }
  if (!on || !filterDef.value?.time) return
  const span = filterDef.value.window ?? (s.max - s.min) / 10
  let last = performance.now()
  let t = s.lo
  const step = (now: number) => {
    // A full sweep in about 12 seconds at speed 1.
    t += ((now - last) / 1000) * ((s.max - s.min) / 12) * s.speed
    last = now
    if (t > s.max) t = s.min
    s.lo = t
    s.hi = Math.min(s.max, t + span)
    if (s.playing) playFrame = requestAnimationFrame(step)
  }
  playFrame = requestAnimationFrame(step)
})
watch(() => s.speed, () => {
  const trip = layers.find((l) => l.id === 'data') as PathLayer | undefined
  if (s.playing && s.layer === 'trips' && trip) trip.play(600 * s.speed)
})

// ---------------------------------------------------------------------------------------------------------------------
// The benchmark: a camera tour, each frame waited for on the GPU

async function benchmark(): Promise<void> {
  if (!map) return
  const v0 = map.getView()
  const frames = 120
  busy.value = 'Benchmarking…'
  stats.bench = ''
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) {
    const a = (i / frames) * Math.PI * 2
    map.setView({ center: v0.center, zoom: v0.zoom + Math.sin(a) * 1.2, bearing: (v0.bearing ?? 0) + Math.sin(a) * 25, pitch: v0.pitch })
    await map.renderNow()
  }
  const ms = (performance.now() - t0) / frames
  map.setView(v0)
  busy.value = ''
  stats.bench = `${ms.toFixed(1)} ms a frame (${Math.round(1000 / ms)} fps) over ${frames} frames, each waited for on the GPU`
}

const fit = () => map?.fitBounds()
const sizeLabel = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : String(n))
const unitOf = computed(() => filterDef.value?.unit ?? '')
const fmtV = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Number.isInteger(v) ? String(v) : v.toFixed(1))
const step = computed(() => (s.max - s.min > 100 ? 1 : (s.max - s.min) / 200))
const rampCss = computed(() => (legend.value ? `linear-gradient(90deg, ${legend.value.stops.join(', ')})` : ''))
const sqlMode = computed(() => ds.value.source === 'smaltdb' || (ds.value.source === 'file' && fileKind.value === 'csv'))
const fileMode = computed(() => ds.value.source === 'file')

// ---------------------------------------------------------------------------------------------------------------------
// Your own file

const dragging = ref(false)
async function openFile(file: File | undefined): Promise<void> {
  if (!file || !map) return
  dragging.value = false
  error.value = ''
  if (s.dataset !== 'file') s.dataset = 'file'
  fileName.value = file.name
  try {
    if (/\.(geo)?json$/i.test(file.name)) {
      busy.value = `Reading ${file.name}…`
      const t0 = performance.now()
      const g = gl.readGeoJSON(await file.text())
      stats.load = undefined
      stats.query = undefined
      fileKind.value = 'geojson'
      // The geometry most of the file is.
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
      if (kind === 'polygons') {
        const p = g.polygons
        data = { kind: 'polygons', count: p.count, starts: p.starts, rings: p.rings, points: { lng: p.lng, lat: p.lat }, columns, properties } as never
      } else if (kind === 'lines') {
        const l = g.lines
        data = { kind: 'paths', count: l.count, starts: l.starts, points: { lng: l.lng, lat: l.lat, times: new Float64Array(l.lng.length) }, columns, properties } as never
      } else data = { kind: 'points', count: g.points.count, columns: { lng: g.points.lng, lat: g.points.lat, ...columns } } as never
      fileMeta.value = {
        layers: kind === 'polygons' ? ['polygons'] : kind === 'lines' ? ['paths'] : ['scatter', 'heatmap', 'hexbin', 'grid'],
        colorBy: colorBy.length ? colorBy : [{ column: '', ramp: 'glow' }],
        filters: colorBy.filter((c) => !c.categorical).map((c) => ({ column: c.column, label: c.column })),
      }
      s.layer = fileMeta.value.layers[0]
      s.colorBy = colorBy[0]?.column ?? ''
      s.filter = ''
      projected = undefined
      stats.generate = performance.now() - t0
      stats.rows = part.count
      await build()
      map.fitBounds()
    } else {
      busy.value = `Loading ${file.name} into smaltdb…`
      if (!db) {
        const smaltdb = await import('smaltdb')
        db = (await smaltdb.open('smaltgl-demo', { storage: 'memory' })) as never
      }
      const t0 = performance.now()
      const r = await gl.importCsv(db as never, 'data', file)
      stats.load = performance.now() - t0
      stats.generate = undefined
      if (!r.lng || !r.lat) throw new Error(`No longitude and latitude columns in ${file.name}: name them lng and lat (or longitude and latitude). Columns: ${r.names.join(', ')}`)
      fileKind.value = 'csv'
      s.sql = `SELECT * FROM data`
      s.layer = 'scatter'
      s.filter = ''
      await runSql()
    }
  } catch (e) {
    error.value = String((e as Error)?.message ?? e)
  } finally {
    busy.value = ''
  }
}
const onDrop = (e: DragEvent) => {
  e.preventDefault()
  void openFile(e.dataTransfer?.files?.[0])
}
const cypherMode = computed(() => ds.value.source === 'smaltcy')
const layerNames: Record<LayerKind, string> = { scatter: 'Points', heatmap: 'Heatmap', hexbin: 'Hexagons', grid: 'Grid', arcs: 'Arcs', trips: 'Trips (playback)', paths: 'Paths', polygons: 'Polygons' }
</script>

<template>
  <div class="demo">
    <aside class="panel" aria-label="Demo settings">
      <label class="field">
        <span>Dataset</span>
        <select v-model="s.dataset" data-test="dataset">
          <option v-for="d in DEMO_DATASETS" :key="d.id" :value="d.id">{{ d.title }}</option>
        </select>
      </label>
      <p class="about">{{ ds.about }}</p>

      <div class="field">
        <span>{{ ds.source === 'fleet' ? 'Vehicles' : ds.source === 'districts' ? 'Districts (about)' : ds.source === 'smaltcy' ? 'Stores' : 'Rows' }}</span>
        <div class="seg" role="radiogroup">
          <button v-for="n in ds.sizes" :key="n" type="button" :class="{ on: s.size === n }" :aria-pressed="s.size === n" @click="s.size = n">{{ sizeLabel(n) }}</button>
        </div>
      </div>

      <div v-if="fileMode" class="field">
        <span>File</span>
        <label class="file">
          <input type="file" accept=".csv,.tsv,.txt,.json,.geojson" data-test="file" @change="(e) => openFile((e.target as HTMLInputElement).files?.[0])" />
          <span>{{ fileName || 'Choose a CSV or GeoJSON file…' }}</span>
        </label>
      </div>
      <div v-if="sqlMode" class="field">
        <span>SQL <small>(table <code>{{ fileMode ? 'data' : 'rides' }}</code>)</small></span>
        <select v-if="!fileMode" class="presets" @change="(e) => { s.sql = SQL_PRESETS[Number((e.target as HTMLSelectElement).value)].sql; runSql() }">
          <option v-for="(p, i) in SQL_PRESETS" :key="i" :value="i">{{ p.title }}</option>
        </select>
        <textarea v-model="s.sql" rows="5" spellcheck="false" aria-label="SQL" @keydown.ctrl.enter="runSql" @keydown.meta.enter="runSql" />
        <button type="button" class="go" @click="runSql">Run SQL</button>
      </div>
      <div v-if="cypherMode" class="field">
        <span>Cypher</span>
        <select class="presets" @change="(e) => { s.cypher = CYPHER_PRESETS[Number((e.target as HTMLSelectElement).value)].cypher; runCypher() }">
          <option v-for="(p, i) in CYPHER_PRESETS" :key="i" :value="i">{{ p.title }}</option>
        </select>
        <textarea v-model="s.cypher" rows="5" spellcheck="false" aria-label="Cypher" @keydown.ctrl.enter="runCypher" @keydown.meta.enter="runCypher" />
        <button type="button" class="go" @click="runCypher">Run Cypher</button>
      </div>

      <label class="field" v-if="ds.layers.length > 1">
        <span>Layer</span>
        <select v-model="s.layer" data-test="layer">
          <option v-for="k in ds.layers" :key="k" :value="k">{{ layerNames[k] }}</option>
        </select>
      </label>
      <label class="field" v-if="ds.colorBy.length > 1 && s.layer !== 'heatmap'">
        <span>{{ s.layer === 'hexbin' || s.layer === 'grid' ? 'Value' : 'Colour by' }}</span>
        <select v-model="s.colorBy">
          <option v-for="c in ds.colorBy" :key="c.column" :value="c.column">{{ c.column }}</option>
        </select>
      </label>
      <label class="field" v-if="s.layer === 'hexbin' || s.layer === 'grid'">
        <span>Cells show</span>
        <select v-model="s.measure">
          <option value="count">Count of points</option>
          <option value="mean">Mean {{ s.colorBy }}</option>
          <option value="sum">Sum of {{ s.colorBy }}</option>
        </select>
      </label>

      <label class="field" v-if="s.layer === 'scatter'">
        <span>Radius <output>{{ s.radius }} px</output></span>
        <input type="range" min="0.5" max="12" step="0.5" v-model.number="s.radius" />
      </label>
      <label class="field" v-if="s.layer === 'heatmap'">
        <span>Kernel <output>{{ s.heatRadius }} px</output></span>
        <input type="range" min="4" max="80" step="1" v-model.number="s.heatRadius" />
      </label>
      <label class="field" v-if="s.layer === 'hexbin' || s.layer === 'grid'">
        <span>Cell size <output>{{ fmtN(s.cellSize) }} m</output></span>
        <input type="range" :min="ds.cellSize && ds.cellSize > 10000 ? 10000 : 50" :max="ds.cellSize && ds.cellSize > 10000 ? 400000 : 3000" :step="ds.cellSize && ds.cellSize > 10000 ? 5000 : 25" v-model.number="s.cellSize" />
      </label>
      <label class="field" v-if="['arcs', 'trips', 'paths'].includes(s.layer)">
        <span>Width <output>{{ s.width }} px</output></span>
        <input type="range" min="0.5" max="6" step="0.1" v-model.number="s.width" />
      </label>
      <div class="checks" v-if="['hexbin', 'grid', 'polygons'].includes(s.layer)">
        <label><input type="checkbox" v-model="s.extrude" data-test="extrude" /> 3D {{ s.layer === 'polygons' ? 'blocks' : 'columns' }} (height: {{ s.layer === 'polygons' ? s.colorBy : 'value' }})</label>
      </div>
      <label class="field" v-if="s.extrude && ['hexbin', 'grid', 'polygons'].includes(s.layer)">
        <span>Height <output>{{ s.height.toFixed(1) }}×</output></span>
        <input type="range" min="0.2" max="4" step="0.1" v-model.number="s.height" />
      </label>
      <label class="field">
        <span>Opacity <output>{{ Math.round(s.opacity * 100) }}%</output></span>
        <input type="range" min="0.05" max="1" step="0.05" v-model.number="s.opacity" />
      </label>
      <div class="checks">
        <label v-if="['scatter', 'arcs', 'trips', 'paths'].includes(s.layer)"><input type="checkbox" v-model="s.additive" /> Glow (additive)</label>
        <label v-if="s.layer === 'arcs' && ds.id !== 'rides' && ds.id !== 'sql'"><input type="checkbox" v-model="s.greatCircle" /> Great circles</label>
        <label v-if="s.layer === 'arcs'"><input type="checkbox" v-model="s.animate" /> Flow</label>
      </div>

      <div class="field" v-if="ds.filters.length && !['trips', 'paths'].includes(s.layer)">
        <span>GPU filter</span>
        <select v-model="s.filter" data-test="filter">
          <option value="">None</option>
          <option v-for="f in ds.filters" :key="f.column" :value="f.column">{{ f.label }}</option>
        </select>
        <template v-if="s.filter">
          <div class="range">
            <input type="range" :min="s.min" :max="s.max" :step="step" v-model.number="s.lo" aria-label="From" />
            <input type="range" :min="s.min" :max="s.max" :step="step" v-model.number="s.hi" aria-label="To" />
          </div>
          <div class="range-text">{{ fmtV(s.lo) }} – {{ fmtV(s.hi) }} {{ unitOf }}</div>
          <div class="play" v-if="filterDef?.time">
            <button type="button" class="go" @click="s.playing = !s.playing">{{ s.playing ? 'Pause' : 'Play' }}</button>
            <label>Speed <select v-model.number="s.speed"><option :value="0.25">¼×</option><option :value="1">1×</option><option :value="4">4×</option></select></label>
          </div>
        </template>
      </div>
      <div class="field" v-if="s.layer === 'trips'">
        <span>Playback <output>{{ clockText }}</output></span>
        <div class="play">
          <button type="button" class="go" @click="s.playing = !s.playing" data-test="play">{{ s.playing ? 'Pause' : 'Play' }}</button>
          <label>Speed <select v-model.number="s.speed"><option :value="0.5">5 min/s</option><option :value="1">10 min/s</option><option :value="4">40 min/s</option></select></label>
        </div>
      </div>

      <label class="field">
        <span>Tilt <output>{{ Math.round(s.pitch) }}°</output></span>
        <input type="range" min="0" max="60" step="1" v-model.number="s.pitch" data-test="pitch" />
      </label>
      <div class="field">
        <span>Basemap</span>
        <div class="seg">
          <button type="button" :class="{ on: s.theme === 'light' }" @click="s.theme = 'light'">Light</button>
          <button type="button" :class="{ on: s.theme === 'dark' }" @click="s.theme = 'dark'">Dark</button>
          <button type="button" :class="{ on: s.theme === 'none' }" @click="s.theme = 'none'">None</button>
        </div>
      </div>
      <div class="buttons">
        <button type="button" @click="fit">Fit to data</button>
        <button type="button" @click="benchmark" data-test="bench">Benchmark</button>
      </div>
    </aside>

    <div class="stage" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop="onDrop">
      <div ref="host" class="map" />
      <div v-if="dragging" class="drop">Drop a CSV or GeoJSON file</div>
      <div v-else-if="fileMode && !fileKind" class="drop hint">Drop a CSV or GeoJSON file here</div>
      <div class="stats" aria-live="off">
        <div><b>{{ fmtN(stats.rows) }}</b> {{ ds.id === 'fleet' ? 'GPS points' : 'rows' }}</div>
        <div v-if="stats.generate !== undefined">generated in <b>{{ fmtMs(stats.generate) }}</b> ms</div>
        <div v-if="stats.load !== undefined">loaded into {{ sqlMode ? 'smaltdb' : 'smaltcy' }} in <b>{{ fmtMs(stats.load) }}</b> ms</div>
        <div v-if="stats.query !== undefined">query <b>{{ fmtMs(stats.query) }}</b> ms</div>
        <div v-if="stats.build !== undefined">to the GPU and drawn in <b>{{ fmtMs(stats.build) }}</b> ms</div>
        <div>frame <b>{{ fmtMs(stats.cpu) }}</b> ms CPU<template v-if="stats.gpu !== undefined"> · <b>{{ fmtMs(stats.gpu) }}</b> ms GPU</template></div>
        <div><b>{{ stats.fps }}</b> fps while moving</div>
        <div v-if="stats.bench" class="bench" data-test="bench-result">{{ stats.bench }}</div>
      </div>
      <div v-if="legend" class="legend">
        <template v-if="legend.categories">
          <div v-for="(c, i) in legend.categories.slice(0, 8)" :key="c" class="cat"><i :style="{ background: legend.stops[i % legend.stops.length] }" />{{ c }}</div>
        </template>
        <template v-else-if="legend.stops.length > 1">
          <div class="bar" :style="{ background: rampCss }" />
          <div class="ends"><span>{{ fmtV(legend.domain[0]) }}</span><span>{{ s.layer === 'heatmap' ? 'density' : s.layer === 'hexbin' || s.layer === 'grid' ? (s.measure === 'count' ? 'points per cell' : `${s.measure} ${s.colorBy}`) : s.colorBy }}</span><span>{{ fmtV(legend.domain[1]) }}</span></div>
        </template>
      </div>
      <div v-if="tooltipNote" class="note">{{ tooltipNote }}</div>
      <div v-if="busy" class="busy" role="status">{{ busy }}</div>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <div v-if="gpuMissing" class="nogpu">
        <p><b>This demo needs WebGPU.</b> It runs in Chrome and Edge 113+, Safari 26+, and Firefox 141+ on Windows. Your browser doesn't offer it, or it's switched off.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo { display: grid; grid-template-columns: 300px 1fr; gap: 0; height: calc(100vh - var(--vp-nav-height) - 110px); min-height: 560px; border: 1px solid var(--vp-c-divider); border-radius: 10px; overflow: hidden; }
.panel { overflow-y: auto; padding: 14px 16px; border-right: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); font-size: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; margin: 0 0 14px; }
.field > span { font-family: var(--font-brand, 'Martian Mono', monospace); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vp-c-text-2); display: flex; justify-content: space-between; }
.field output { font-family: var(--vp-font-family-mono); text-transform: none; letter-spacing: 0; color: var(--vp-c-text-1); }
select, textarea { width: 100%; padding: 6px 8px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg-alt); color: var(--vp-c-text-1); font: inherit; }
textarea { font-family: var(--vp-font-family-mono); font-size: 12.5px; line-height: 1.5; resize: vertical; }
select:focus-visible, textarea:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 1px; }
input[type='range'] { width: 100%; accent-color: var(--vp-c-brand-1); }
.about { margin: -4px 0 14px; color: var(--vp-c-text-2); font-size: 13px; line-height: 1.5; }
.seg { display: flex; flex-wrap: wrap; gap: 4px; }
.seg button, .buttons button, .go { padding: 3px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: transparent; color: var(--vp-c-text-1); font-weight: 500; font-size: 13px; cursor: pointer; }
.seg button.on, .go { background: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); color: var(--vp-c-white); }
.seg button:hover, .buttons button:hover { border-color: var(--vp-c-brand-1); }
.checks { display: flex; flex-direction: column; gap: 4px; margin: -4px 0 14px; color: var(--vp-c-text-1); }
.checks label { display: flex; gap: 6px; align-items: center; }
.range { display: grid; gap: 2px; }
.range-text { font-family: var(--vp-font-family-mono); font-size: 12px; color: var(--vp-c-text-2); }
.play { display: flex; gap: 10px; align-items: center; }
.play select { width: auto; padding: 2px 6px; }
.buttons { display: flex; gap: 6px; flex-wrap: wrap; }
.stage { position: relative; min-height: 400px; }
.map { position: absolute; inset: 0; }
.stats { position: absolute; top: 10px; right: 10px; z-index: 3; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent); border: 1px solid var(--vp-c-divider); font-family: var(--vp-font-family-mono); font-size: 12px; line-height: 1.6; color: var(--vp-c-text-2); max-width: 300px; }
.stats b { color: var(--vp-c-text-1); font-weight: 500; }
.stats .bench { margin-top: 4px; color: var(--vp-c-text-1); }
.legend { position: absolute; left: 10px; bottom: 26px; z-index: 3; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent); border: 1px solid var(--vp-c-divider); font-size: 12px; min-width: 220px; }
.legend .bar { height: 10px; border-radius: 3px; }
.legend .ends { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; font-family: var(--vp-font-family-mono); color: var(--vp-c-text-2); }
.legend .cat { display: flex; align-items: center; gap: 6px; }
.legend .cat i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.note { position: absolute; left: 10px; top: 10px; z-index: 3; font-size: 12px; padding: 4px 8px; border-radius: 6px; background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent); color: var(--vp-c-text-2); }
.busy { position: absolute; left: 50%; top: 16px; transform: translateX(-50%); z-index: 4; padding: 6px 12px; border-radius: 999px; background: var(--vp-c-brand-1); color: var(--vp-c-white); font-size: 13px; }
.error { position: absolute; left: 10px; right: 10px; bottom: 80px; z-index: 4; padding: 8px 10px; border-radius: 8px; background: var(--vp-c-bg); border: 1px solid var(--vp-c-danger-1); color: var(--vp-c-danger-1); font-size: 13px; }
.error::before { content: '✕ '; }
.drop { position: absolute; inset: 12px; z-index: 5; display: grid; place-items: center; border: 2px dashed var(--vp-c-brand-1); border-radius: 10px; background: color-mix(in srgb, var(--vp-c-bg) 70%, transparent); font-weight: 500; color: var(--vp-c-text-1); }
.drop.hint { pointer-events: none; background: transparent; border-color: var(--vp-c-divider); color: var(--vp-c-text-2); }
.file { position: relative; display: block; padding: 6px 8px; border: 1px dashed var(--vp-c-divider); border-radius: 6px; cursor: pointer; color: var(--vp-c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file:hover { border-color: var(--vp-c-brand-1); }
.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.nogpu { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; background: var(--vp-c-bg-alt); }
@media (max-width: 760px) {
  .demo { grid-template-columns: 1fr; grid-template-rows: auto 70vh; height: auto; }
  .panel { border-right: 0; border-bottom: 1px solid var(--vp-c-divider); max-height: 46vh; }
}
</style>
