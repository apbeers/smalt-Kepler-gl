// Generated datasets with the shape of real ones, from a few thousand rows to millions: made in a worker.
import type { Dataset, GeneratorName } from './generators.js';
export * from './generators.js';
export * as places from './places.js';

let worker: Worker | undefined;
let next = 1;
const pending = new Map<number, { resolve: (v: { dataset: Dataset; ms: number }) => void; reject: (e: Error) => void }>();

function dataWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'smaltgl data' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (!p) return;
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve({ dataset: e.data.dataset, ms: e.data.ms });
    };
  }
  return worker;
}

/**
 * Generates a dataset in a worker. Resolves with the dataset (its typed arrays moved to this thread without copying)
 * and how long the generator took.
 */
export function generate<N extends GeneratorName>(name: N, size: number, seed?: number): Promise<{ dataset: ReturnType<(typeof import('./generators.js').GENERATORS)[N]['make']>; ms: number }> {
  const id = next++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: { dataset: Dataset; ms: number }) => void, reject });
    dataWorker().postMessage({ id, name, size, seed });
  });
}
