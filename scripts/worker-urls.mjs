// An esbuild plugin for smaltgl's workers. The source starts them with `new Worker(new URL('./tile-worker.ts',
// import.meta.url))`, which Vite bundles on its own; esbuild doesn't, so this rewrites those URLs to the files the
// build writes next to the bundle (`names` maps a source file name to its output file name).
import { readFile } from 'node:fs/promises';

export function workerUrls(names) {
  return {
    name: 'smaltgl-worker-urls',
    setup(build) {
      build.onLoad({ filter: /src[\\/](basemap|datasets)[\\/][^\\/]+\.ts$/ }, async (args) => {
        let code = await readFile(args.path, 'utf8');
        for (const [from, to] of Object.entries(names)) code = code.split(`new URL('./${from}'`).join(`new URL('./${to}'`);
        return { contents: code, loader: 'ts' };
      });
    },
  };
}
