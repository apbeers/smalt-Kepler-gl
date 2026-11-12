/**
 * Synthetic datasets with the shape of real ones, generated in the browser at any size: from a few thousand rows to
 * ten million. Each generator is in a file of its own, deterministic for a seed, writes straight into typed arrays
 * (no object per row), and runs in a worker (worker.ts) so the page stays responsive. This file is the registry.
 */
import { districts } from './districts.js';
import { earthquakes } from './earthquakes.js';
import { fleet } from './fleet.js';
import { flights } from './flights.js';
import { rides } from './rides.js';
import { ships } from './ships.js';

export * from './types.js';
export { rng, gaussian, picker, haversineKm } from './random.js';
export { rides } from './rides.js';
export { flights } from './flights.js';
export { fleet } from './fleet.js';
export { earthquakes } from './earthquakes.js';
export { ships, seaRoute } from './ships.js';
export { districts } from './districts.js';
export { supplyChain, type SupplyChainGraph } from './supply-chain.js';

/** Every generator by name, with the sizes the tech demo offers. */
export const GENERATORS = {
  rides: { make: (n: number, seed?: number) => rides(n, seed), sizes: [10_000, 100_000, 1_000_000, 5_000_000, 10_000_000] },
  flights: { make: (n: number, seed?: number) => flights(n, seed), sizes: [1_000, 10_000, 100_000, 500_000, 1_000_000] },
  fleet: { make: (n: number, seed?: number) => fleet(n, seed), sizes: [50, 500, 2_000, 10_000] },
  earthquakes: { make: (n: number, seed?: number) => earthquakes(n, seed), sizes: [10_000, 100_000, 1_000_000, 3_000_000] },
  ships: { make: (n: number, seed?: number) => ships(n, seed), sizes: [10_000, 100_000, 1_000_000, 5_000_000] },
  districts: { make: (n: number, seed?: number) => districts(n, seed), sizes: [400, 2_500, 10_000, 40_000] },
} as const;

export type GeneratorName = keyof typeof GENERATORS;
