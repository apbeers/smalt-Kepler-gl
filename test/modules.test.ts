// The boundaries between smaltgl's pieces, kept by tests. Each piece is meant to be used on its own (an entry point in
// scripts/entries.mjs) and changed on its own: a new dependency between them changes the tables here on purpose,
// never by accident.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
// @ts-expect-error: a plain JavaScript module, shared with the build.
import { ENTRIES, WORKERS, specifier } from '../scripts/entries.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = ENTRIES as Record<string, string>;

/**
 * The map's pieces (core, map, layers, basemap, data, visual) live in the shared kit, as `smaltkit/geo/<piece>`; the
 * kit's own test (test/geo-modules.test.ts there) keeps their boundaries. Here each of smaltgl's entry points for them
 * is one line that re-exports the kit's piece of the same name, so `@smaltworks/smaltgl/<name>` and
 * `smaltkit/geo/<name>` are the same code.
 */
const KIT_ENTRIES = ['core', 'map', 'layers', 'layer-kit', 'scatter', 'heatmap', 'aggregate', 'arcs', 'paths', 'polygons', 'basemap', 'vector-tiles', 'data', 'geojson', 'smaltdb', 'smaltcy', 'visual'];

/** Which folders of src/ each folder may import from (relative imports). */
const ALLOWED: Record<string, readonly string[]> = {
  datasets: ['datasets'],
  // Host adapters use only the visual piece.
  hosts: ['visual'],
};

function sources(dir = join(root, 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [join(dir, e.name)] : []));
}

/** Relative imports of a source file (static, dynamic and type-only), resolved to paths under src/. */
function importsOf(file: string): string[] {
  const code = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of code.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) out.push(relative(join(root, 'src'), resolve(dirname(file), m[1].replace(/\.js$/, '.ts'))));
  return out;
}

describe('imports', () => {
  for (const name of KIT_ENTRIES) {
    it(`${specifier(name)} is the kit's smaltkit/geo/${name}`, () => {
      const code = readFileSync(join(root, entries[name]), 'utf8');
      const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      expect(imports).toEqual([`smaltkit/geo/${name}`]);
    });
  }

  for (const file of sources()) {
    const rel = relative(join(root, 'src'), file);
    const folder = rel.includes('/') ? rel.split('/')[0] : '';
    if (!ALLOWED[folder]) continue;
    it(`${rel} imports only what its folder may`, () => {
      for (const imp of importsOf(file)) expect(ALLOWED[folder], `${rel} imports ${imp}`).toContain(imp.split('/')[0]);
    });
  }
});

/** What a bundle of one entry point contains: its source files under src/ and the kit's files under geo/. */
async function bundled(entry: string): Promise<string[]> {
  const r = await esbuild.build({
    entryPoints: [join(root, entry)],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
  });
  return Object.keys(r.metafile!.inputs).map((p) => p.replace(/^node_modules\/smaltkit\/dist\//, 'kit/')).filter((p) => /^(src|kit)\//.test(p));
}

describe('each entry point bundled on its own', () => {
  // What must never come along: [entry, pattern of files it must not hold].
  const forbidden: Record<string, RegExp> = {
    core: /^kit\/(?!geo\/core\/)/,
    map: /^kit\/geo\/(layers|basemap|data|visual)\//,
    'vector-tiles': /^kit\/geo\/(core\/gpu|map|layers|data|visual)|^kit\/geo\/basemap\/(tile-renderer|label-renderer|labels|basemap)\.js$/,
    scatter: /^kit\/geo\/(map|basemap|data|visual)\/|^kit\/geo\/layers\/(heatmap|aggregate|arcs|paths|polygons)\.js$/,
    smaltdb: /^kit\/(?!geo\/data\/)/,
    datasets: /^(?!src\/datasets\/)/,
    visual: /^src\/(datasets|hosts)\/|^kit\/graph\//,
  };

  for (const [name, pattern] of Object.entries(forbidden)) {
    it(`${specifier(name)} holds only its own part`, async () => {
      const files = await bundled(entries[name]);
      expect(files.length).toBeGreaterThan(0);
      expect(files.filter((f) => pattern.test(f))).toEqual([]);
    });
  }
});

describe('the entry point table', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
  const guide = readFileSync(join(root, 'docs/guide/modules.md'), 'utf8');

  it('every entry and worker exists', () => {
    for (const f of [...Object.values(entries), ...Object.values(WORKERS as Record<string, string>)]) expect(existsSync(join(root, f)), f).toBe(true);
  });

  it('package.json exports every entry, and only those (plus the workers)', () => {
    const want = Object.keys(entries).map((n) => (n === 'smaltgl' ? '.' : `./${n}`));
    const have = Object.keys(pkg.exports).filter((k) => !/worker|plugin|package\.json/.test(k));
    expect(have.sort()).toEqual(want.sort());
  });

  it('tsconfig maps every entry to its source', () => {
    for (const [name, file] of Object.entries(entries)) expect(tsconfig.compilerOptions.paths[specifier(name)], name).toEqual([`./${file}`]);
  });

  it('the guide to the pieces lists every entry', () => {
    for (const name of Object.keys(entries)) expect(guide, name).toContain(`\`${specifier(name)}\``);
  });
});
