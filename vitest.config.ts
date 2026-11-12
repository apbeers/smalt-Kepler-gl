import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@smaltworks\/smaltgl$/, replacement: here('./src/index.ts') },
      { find: /^@smaltworks\/smaltgl\/(core|basemap|layers|data|datasets)$/, replacement: here('./src/$1/index.ts') },
      // smaltcy is pinned to a commit of its repository, which ships its TypeScript source, not dist/.
      { find: /^@smaltworks\/smaltcy$/, replacement: here('./node_modules/@smaltworks/smaltcy/src/index.ts') },
    ],
  },
  test: { include: ['test/**/*.test.ts'], isolate: false },
});
