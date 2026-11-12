import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// @ts-expect-error: a plain JavaScript module, shared with the build.
import { ENTRIES, specifier } from './scripts/entries.mjs';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export default defineConfig({
  resolve: {
    alias: [
      ...Object.entries(ENTRIES as Record<string, string>).map(([name, path]) => ({ find: new RegExp(`^${escape(specifier(name))}$`), replacement: here(`./${path}`) })),
      // smaltcy is pinned to a commit of its repository, which ships its TypeScript source, not dist/.
      { find: /^@smaltworks\/smaltcy$/, replacement: here('./node_modules/@smaltworks/smaltcy/src/index.ts') },
    ],
  },
  test: { include: ['test/**/*.test.ts'], isolate: false },
});
