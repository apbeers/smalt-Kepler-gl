// The tech demo's datasets: what each is, which layers suit it, what to colour and filter by, and where to look.
// Generated in a worker at the size picked (src/datasets). test/browser/demo.mjs loads each on the built site.
import type { GeneratorName } from '@smaltworks/smaltgl/datasets'

export type LayerKind = 'scatter' | 'heatmap' | 'hexbin' | 'grid' | 'arcs' | 'trips' | 'paths' | 'polygons'

export interface DemoDataset {
  readonly id: string
  /** The generator, or a database-backed source. */
  readonly source: GeneratorName | 'smaltdb' | 'smaltcy' | 'file'
  readonly title: string
  /** The use case, in a sentence. */
  readonly about: string
  readonly layers: readonly LayerKind[]
  /** Columns to colour by (the first is the default), with a ramp for each. */
  readonly colorBy: readonly { readonly column: string; readonly ramp: string; readonly categorical?: boolean }[]
  /** Columns to filter by on the GPU; `time` columns get a play button. */
  readonly filters: readonly { readonly column: string; readonly label: string; readonly time?: boolean; readonly window?: number; readonly unit?: string }[]
  readonly sizes: readonly number[]
  /** Index into sizes to start with. */
  readonly start: number
  readonly view: { readonly center: readonly [number, number]; readonly zoom: number }
  readonly theme: 'light' | 'dark'
  /** Default layer settings. */
  readonly radius?: number
  readonly cellSize?: number
  readonly opacity?: number
  /** One-click views worth seeing: settings, and where to look. */
  readonly presets?: readonly Preset[]
}

export interface Preset {
  readonly title: string
  readonly state: Readonly<Record<string, string | number | boolean>>
  readonly view?: { readonly center?: readonly [number, number]; readonly zoom?: number; readonly bearing?: number; readonly pitch?: number }
}

export const DEMO_DATASETS: readonly DemoDataset[] = [
  {
    id: 'rides',
    source: 'rides',
    title: 'Ride pickups, New York',
    about:
      'Ride-hailing pickups across New York City, clustered in busy neighbourhoods and on the street grid, with commuting peaks and late nights where the bars are. Play the hour to watch the city wake up.',
    layers: ['scatter', 'heatmap', 'hexbin', 'grid', 'arcs'],
    colorBy: [
      { column: 'fare', ramp: 'ember' },
      { column: 'hour', ramp: 'glow' },
      { column: 'distance', ramp: 'smalt' },
      { column: 'passengers', ramp: 'verdant' },
    ],
    filters: [
      { column: 'hour', label: 'Hour of day', time: true, window: 2, unit: 'h' },
      { column: 'fare', label: 'Fare', unit: '$' },
      { column: 'distance', label: 'Distance', unit: 'km' },
    ],
    presets: [
      { title: 'Rush hour in 3D', state: { layer: 'hexbin', extrude: true, filter: 'hour', lo: 17, hi: 19 }, view: { center: [-73.97, 40.74], zoom: 11.4, pitch: 55, bearing: -20 } },
      { title: 'Late-night glow', state: { layer: 'scatter', colorBy: 'fare', additive: true, filter: 'hour', lo: 22, hi: 24 }, view: { center: [-73.97, 40.72], zoom: 12 } },
      { title: 'Airport trips', state: { layer: 'arcs', filter: 'distance', lo: 12, hi: 60 }, view: { center: [-73.88, 40.71], zoom: 10.3 } },
      { title: 'Density', state: { layer: 'heatmap' }, view: { center: [-73.96, 40.74], zoom: 11 } },
    ],
    sizes: [10_000, 100_000, 1_000_000, 5_000_000, 10_000_000],
    start: 0,
    view: { center: [-73.95, 40.73], zoom: 11 },
    theme: 'dark',
    radius: 2.5,
    cellSize: 300,
  },
  {
    id: 'flights',
    source: 'flights',
    title: 'Flights between airports',
    about:
      'Scheduled flights between 96 of the world’s busiest airports, more between busy airports and fewer the farther apart they are. Great circles follow the routes planes fly; animated dashes show the direction of travel.',
    layers: ['arcs', 'scatter', 'heatmap'],
    colorBy: [
      { column: 'distance', ramp: 'glow' },
      { column: 'airline', ramp: 'categorical', categorical: true },
      { column: 'seats', ramp: 'ember' },
      { column: 'hour', ramp: 'smalt' },
    ],
    filters: [
      { column: 'hour', label: 'Departure hour', time: true, window: 3, unit: 'h' },
      { column: 'distance', label: 'Distance', unit: 'km' },
      { column: 'seats', label: 'Seats' },
    ],
    presets: [
      { title: 'Long haul', state: { layer: 'arcs', colorBy: 'distance', filter: 'distance', lo: 8000, hi: 20000 }, view: { center: [40, 20], zoom: 1.2 } },
      { title: 'By airline', state: { layer: 'arcs', colorBy: 'airline', greatCircle: false } },
      { title: 'Busiest destinations', state: { layer: 'heatmap' } },
    ],
    sizes: [1_000, 10_000, 100_000, 500_000, 1_000_000],
    start: 0,
    view: { center: [20, 30], zoom: 1.3 },
    theme: 'dark',
    radius: 2,
    opacity: 0.45,
  },
  {
    id: 'fleet',
    source: 'fleet',
    title: 'Delivery fleet, London',
    about:
      'Vans, cargo bikes and trucks on delivery rounds across London: out of a depot in the morning, along the streets to each stop, and back. Every position has a time; playback draws only what has happened, with fading trails.',
    layers: ['trips', 'paths', 'scatter', 'heatmap', 'hexbin'],
    colorBy: [
      { column: 'vehicle', ramp: 'categorical', categorical: true },
      { column: 'distance', ramp: 'glow' },
      { column: 'stops', ramp: 'ember' },
    ],
    filters: [],
    presets: [
      { title: 'Play the morning', state: { layer: 'trips', playing: true } },
      { title: 'Every route', state: { layer: 'paths' } },
      { title: 'Hotspots in 3D', state: { layer: 'hexbin', extrude: true }, view: { center: [-0.12, 51.5], zoom: 10.6, pitch: 50, bearing: 15 } },
    ],
    sizes: [50, 500, 2_000, 10_000],
    start: 0,
    view: { center: [-0.12, 51.51], zoom: 10.6 },
    theme: 'dark',
    radius: 1.5,
    cellSize: 300,
  },
  {
    id: 'earthquakes',
    source: 'earthquakes',
    title: 'Earthquakes, 2000–2025',
    about:
      'Earthquakes along the world’s plate boundaries: ten times fewer for each step up in magnitude, deeper on the landward side of the trenches, with aftershocks after the big ones. Filter by magnitude or play the years.',
    layers: ['scatter', 'heatmap', 'hexbin', 'grid'],
    colorBy: [
      { column: 'depth', ramp: 'ember' },
      { column: 'magnitude', ramp: 'glow' },
      { column: 'year', ramp: 'smalt' },
    ],
    filters: [
      { column: 'magnitude', label: 'Magnitude' },
      { column: 'year', label: 'Year', time: true, window: 3 },
      { column: 'depth', label: 'Depth', unit: 'km' },
    ],
    presets: [
      { title: 'Magnitude 6+', state: { layer: 'scatter', colorBy: 'magnitude', filter: 'magnitude', lo: 6, hi: 10 } },
      { title: 'Ring of Fire in 3D', state: { layer: 'hexbin', extrude: true }, view: { center: [165, 5], zoom: 1.8, pitch: 50, bearing: -15 } },
      { title: 'Deep quakes', state: { layer: 'scatter', colorBy: 'depth', filter: 'depth', lo: 150, hi: 700 } },
    ],
    sizes: [10_000, 100_000, 1_000_000, 3_000_000],
    start: 0,
    view: { center: [150, 15], zoom: 1.4 },
    theme: 'light',
    radius: 2.5,
    cellSize: 100_000,
  },
  {
    id: 'ships',
    source: 'ships',
    title: 'Ships at sea',
    about:
      'Positions reported by ships along the lanes between 36 container ports: through the Strait of Malacca, the Suez and Panama canals, and round the capes. Slow near ports, fast in open water.',
    layers: ['scatter', 'heatmap', 'hexbin', 'grid'],
    colorBy: [
      { column: 'type', ramp: 'categorical', categorical: true },
      { column: 'speed', ramp: 'glow' },
    ],
    filters: [{ column: 'speed', label: 'Speed', unit: 'kn' }],
    presets: [
      { title: 'Slow near ports', state: { layer: 'scatter', colorBy: 'speed', filter: 'speed', lo: 0, hi: 6 }, view: { center: [104, 2], zoom: 5 } },
      { title: 'Busiest waters', state: { layer: 'grid' } },
    ],
    sizes: [10_000, 100_000, 1_000_000, 5_000_000],
    start: 0,
    view: { center: [60, 20], zoom: 1.5 },
    theme: 'dark',
    radius: 2,
    cellSize: 120_000,
  },
  {
    id: 'districts',
    source: 'districts',
    title: 'Districts, Chicago',
    about:
      'Chicago cut into census-tract-like districts, each with its population, density, median income and commute. A choropleth: polygons coloured by value, hover for the numbers.',
    layers: ['polygons'],
    colorBy: [
      { column: 'income', ramp: 'verdant' },
      { column: 'density', ramp: 'ember' },
      { column: 'commute', ramp: 'smalt' },
      { column: 'population', ramp: 'glow' },
    ],
    filters: [
      { column: 'income', label: 'Median income', unit: '$' },
      { column: 'commute', label: 'Commute', unit: 'min' },
    ],
    presets: [
      { title: 'Density in 3D', state: { colorBy: 'density', extrude: true }, view: { center: [-87.68, 41.86], zoom: 10.2, pitch: 50, bearing: 20 } },
      { title: 'Long commutes', state: { colorBy: 'commute', filter: 'commute', lo: 40, hi: 120 } },
    ],
    sizes: [400, 2_500, 10_000, 40_000],
    start: 0,
    view: { center: [-87.7, 41.84], zoom: 9.6 },
    theme: 'light',
  },
  {
    id: 'sql',
    source: 'smaltdb',
    title: 'Rides, queried with SQL (smaltdb)',
    about:
      'The New York rides, loaded into a smaltdb table in this tab. Each query runs in smaltdb’s worker and comes back as columns of numbers that go straight to the GPU. Edit the SQL and run it.',
    layers: ['scatter', 'heatmap', 'hexbin', 'arcs'],
    colorBy: [{ column: 'fare', ramp: 'ember' }],
    filters: [],
    sizes: [10_000, 100_000, 500_000, 1_000_000],
    start: 0,
    view: { center: [-73.95, 40.73], zoom: 11 },
    theme: 'dark',
    radius: 2,
    cellSize: 200,
  },
  {
    id: 'graph',
    source: 'smaltcy',
    title: 'Supply chain, queried with Cypher (smaltcy)',
    about:
      'A supply chain as a graph in smaltcy: suppliers ship parts to factories, factories to warehouses, warehouses deliver to stores. Each Cypher query’s nodes become points and its relationships arcs.',
    layers: ['arcs'],
    colorBy: [{ column: 'type', ramp: 'categorical', categorical: true }],
    filters: [],
    sizes: [200, 2_000, 10_000],
    start: 0,
    view: { center: [20, 30], zoom: 1.3 },
    theme: 'dark',
    radius: 3,
  },
  {
    id: 'file',
    source: 'file',
    title: 'Your own file (CSV or GeoJSON)',
    about:
      'Drop a CSV or GeoJSON file on the map, or pick one. A CSV goes into a smaltdb table named data (columns named lng and lat, or longitude and latitude, place the points), and you can query it with SQL. GeoJSON points, lines and polygons (holes included) draw as they are. Nothing leaves your browser.',
    layers: ['scatter', 'heatmap', 'hexbin', 'grid'],
    colorBy: [{ column: '', ramp: 'glow' }],
    filters: [],
    sizes: [0],
    start: 0,
    view: { center: [0, 20], zoom: 1.5 },
    theme: 'light',
    radius: 3,
    cellSize: 1000,
  },
]

export const SQL_PRESETS: readonly { readonly title: string; readonly sql: string }[] = [
  { title: 'Evening rush, fares over $20', sql: 'SELECT lng, lat, fare\nFROM rides\nWHERE hour BETWEEN 17 AND 19 AND fare > 20' },
  { title: 'Airport pickups', sql: "SELECT lng, lat, fare\nFROM rides\nWHERE distance > 14" },
  { title: 'Late nights', sql: 'SELECT lng, lat, fare\nFROM rides\nWHERE hour >= 22 OR hour < 3' },
  { title: 'Long trips as arcs', sql: 'SELECT lng, lat, dropLng, dropLat, fare\nFROM rides\nWHERE distance > 8\nLIMIT 20000' },
  { title: 'Everything', sql: 'SELECT lng, lat, fare FROM rides' },
]

export const CYPHER_PRESETS: readonly { readonly title: string; readonly cypher: string }[] = [
  { title: 'Whole network', cypher: 'MATCH p = (a)-[r]->(b)\nRETURN p' },
  { title: 'Supplier to factory', cypher: 'MATCH p = (:Supplier)-[:SUPPLIES]->(:Factory)\nRETURN p' },
  {
    title: 'What reaches London stores',
    cypher: "MATCH p = (:Supplier)-[:SUPPLIES]->(:Factory)-[:SHIPS_TO]->(:Warehouse)-[:DELIVERS_TO]->(s:Store)\nWHERE s.name STARTS WITH 'London'\nRETURN p",
  },
  { title: 'Slow deliveries (5+ days)', cypher: 'MATCH p = (w:Warehouse)-[d:DELIVERS_TO]->(s:Store)\nWHERE d.days >= 5\nRETURN p' },
  { title: 'Everything one factory feeds', cypher: "MATCH p = (f:Factory {name: 'Monterrey plant'})-[*1..2]->(x)\nRETURN p" },
]
