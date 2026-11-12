// Every ```ts example in the guides to the pieces type-checks against the source, through the package's entry points.
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['docs/guide/modules.md', 'docs/guide/custom-layers.md'];

describe('TypeScript in the guides', () => {
  it('type-checks', () => {
    const dir = join(root, 'node_modules/.cache/docs-ts');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const files: string[] = [];
    for (const page of PAGES) {
      const md = readFileSync(join(root, page), 'utf8');
      let i = 0;
      for (const m of md.matchAll(/```ts\n([\s\S]*?)```/g)) {
        const f = join(dir, `${page.replace(/\W+/g, '-')}-${++i}.ts`);
        writeFileSync(f, `${m[1]}\nexport {};\n`);
        files.push(f);
      }
    }
    expect(files.length).toBeGreaterThan(5);
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ extends: '../../../tsconfig.json', compilerOptions: { noEmit: true, noUnusedLocals: false }, include: ['*.ts', '../../../src/**/*.ts'] }));
    let out = '';
    try {
      execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' });
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(out).toBe('');
  }, 120_000);
});
