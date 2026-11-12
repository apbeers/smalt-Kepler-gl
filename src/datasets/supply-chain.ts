/** Generated data: a graph with places, for smaltcy. */
import { STORE_CITIES, SUPPLY_SITES, type Place } from './places.js';
import { gaussian, haversineKm, picker, rng } from './random.js';

export interface SupplyChainGraph {
  readonly nodes: readonly { readonly id: number; readonly label: string; readonly name: string; readonly lng: number; readonly lat: number; readonly capacity: number }[];
  readonly edges: readonly { readonly from: number; readonly to: number; readonly type: string; readonly volume: number; readonly days: number }[];
}

/**
 * A supply chain as a graph: suppliers in Asia ship parts to factories, factories ship to regional warehouses, and
 * warehouses deliver to `stores` stores in 26 cities. Labels: Supplier, Factory, Warehouse, Store. Relationships:
 * SUPPLIES, SHIPS_TO, DELIVERS_TO, each with a volume and the days in transit.
 */
export function supplyChain(stores: number, seed = 7): SupplyChainGraph {
  const r = rng(seed), g = gaussian(r);
  const nodes: { id: number; label: string; name: string; lng: number; lat: number; capacity: number }[] = [];
  const edges: { from: number; to: number; type: string; volume: number; days: number }[] = [];
  const label = { supplier: 'Supplier', factory: 'Factory', warehouse: 'Warehouse' } as const;
  for (const [name, lng, lat, kind] of SUPPLY_SITES) nodes.push({ id: nodes.length, label: label[kind], name, lng, lat, capacity: Math.round(500 + r() * 2000) });
  const of = (l: string) => nodes.filter((n) => n.label === l);
  const suppliers = of('Supplier'), factories = of('Factory'), warehouses = of('Warehouse');
  const days = (a: { lng: number; lat: number }, b: { lng: number; lat: number }, perDayKm: number) => Math.max(1, Math.round(haversineKm(a.lng, a.lat, b.lng, b.lat) / perDayKm + r() * 2));
  for (const f of factories) {
    const k = 2 + Math.floor(r() * 3);
    for (const s of [...suppliers].sort(() => r() - 0.5).slice(0, k)) edges.push({ from: s.id, to: f.id, type: 'SUPPLIES', volume: Math.round(100 + r() * 900), days: days(s, f, 600) });
  }
  for (const w of warehouses) {
    // Each warehouse buys from the nearer factories.
    const near = [...factories].sort((a, b) => haversineKm(a.lng, a.lat, w.lng, w.lat) - haversineKm(b.lng, b.lat, w.lng, w.lat)).slice(0, 2 + Math.floor(r() * 2));
    for (const f of near) edges.push({ from: f.id, to: w.id, type: 'SHIPS_TO', volume: Math.round(200 + r() * 1500), days: days(f, w, 500) });
  }
  const pickCity = picker(STORE_CITIES.map((c) => c[3]), r);
  for (let i = 0; i < stores; i++) {
    const c: Place = STORE_CITIES[pickCity()];
    const lat = c[2] + g() * 0.12, lng = c[1] + g() * 0.15;
    const store = { id: nodes.length, label: 'Store', name: `${c[0]} #${i + 1}`, lng, lat, capacity: Math.round(20 + r() * 80) };
    nodes.push(store);
    const w = [...warehouses].sort((a, b) => haversineKm(a.lng, a.lat, lng, lat) - haversineKm(b.lng, b.lat, lng, lat))[0];
    edges.push({ from: w.id, to: store.id, type: 'DELIVERS_TO', volume: Math.round(5 + r() * 60), days: days(w, store, 700) });
  }
  return { nodes, edges };
}
