// An esbuild plugin for the workers: the kit's tile source starts `new Worker(new URL('./tile-worker.js',
// import.meta.url))` and smaltgl's datasets `new URL('./worker.ts', …)`. Vite bundles those on its own; esbuild doesn't,
// so this rewrites the URLs to the files the build writes next to the bundle (`names` maps a source file name to its
// output file name).
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function workerUrls(names) {
  return {
    name: 'smaltgl-worker-urls',
    setup(build) {
      build.onLoad({ filter: /src[\\/]datasets[\\/][^\\/]+\.ts$|smaltkit[\\/]dist[\\/]geo[\\/]basemap[\\/]tile-source\.js$/ }, async (args) => {
        let code = await readFile(args.path, 'utf8');
        for (const [from, to] of Object.entries(names)) code = code.split(`new URL('./${from}'`).join(`new URL('./${to}'`);
        return { contents: code, loader: args.path.endsWith('.ts') ? 'ts' : 'js', resolveDir: dirname(args.path) };
      });
    },
  };
}
