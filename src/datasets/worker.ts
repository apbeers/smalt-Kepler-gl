/**
 * The dataset worker: generates a dataset off the main thread and hands its typed arrays over without copying.
 * Messages: { id, name, size, seed } in; { id, dataset, ms } or { id, error } out.
 */
import { GENERATORS, type Dataset, type GeneratorName } from './generators.js';

/** Every typed array's buffer in a dataset, to transfer. */
function buffers(d: Dataset): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  const add = (o: unknown) => {
    if (ArrayBuffer.isView(o)) out.add(o.buffer as ArrayBuffer);
    else if (o && typeof o === 'object') for (const v of Object.values(o)) add(v);
  };
  add(d);
  return [...out];
}

self.onmessage = (e: MessageEvent<{ id: number; name: GeneratorName; size: number; seed?: number }>) => {
  const { id, name, size, seed } = e.data;
  try {
    const t0 = performance.now();
    const dataset = GENERATORS[name].make(size, seed);
    const ms = performance.now() - t0;
    (self as unknown as Worker).postMessage({ id, dataset, ms }, buffers(dataset));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
