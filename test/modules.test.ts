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

/** Which folders of src/ each folder may import from. */
const ALLOWED: Record<string, readonly string[]> = {
  core: ['core'],
  map: ['core', 'map'],
  layers: ['core', 'layers'],
  basemap: ['core', 'basemap'],
  data: ['data'],
  datasets: ['datasets'],
};

/** Layer implementations: none may import another (they share layer.ts, common.ts and triangulate.ts). */
const LAYER_FILES = ['scatter', 'heatmap', 'aggregate', 'arcs', 'paths', 'polygons'];

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

describe('imports between folders', () => {
  for (const file of sources()) {
    const rel = relative(join(root, 'src'), file);
    const folder = rel.includes('/') ? rel.split('/')[0] : '';
    if (!folder) continue; // src/index.ts gathers everything
    it(`${rel} imports only what its folder may`, () => {
      for (const imp of importsOf(file)) {
        const target = imp.split('/')[0];
        expect(ALLOWED[folder], `${rel} imports ${imp}`).toContain(target);
      }
    });
  }

  it('no layer imports another layer', () => {
    for (const name of LAYER_FILES) {
      const imps = importsOf(join(root, 'src/layers', `${name}.ts`));
      for (const other of LAYER_FILES) if (other !== name) expect(imps, `${name}.ts imports ${other}.ts`).not.toContain(`layers/${other}.ts`);
    }
  });

  it('the tile source and the vector tile code use no GPU', () => {
    for (const f of ['tile-source', 'tile-worker', 'build', 'mvt', 'style', 'tiles', 'vector-tiles']) {
      const imps = importsOf(join(root, 'src/basemap', `${f}.ts`));
      expect(imps, f).not.toContain('core/gpu.ts');
      expect(imps.filter((i) => /renderer|labels/.test(i)), f).toEqual([]);
    }
  });
});

/** What a bundle of one entry point contains: its source files under src/. */
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
  return Object.keys(r.metafile!.inputs).filter((p) => p.startsWith('src/'));
}

describe('each entry point bundled on its own', () => {
  // What must never come along: [entry, pattern of files it must not hold].
  const forbidden: Record<string, RegExp> = {
    core: /^src\/(?!core\/)/,
    map: /^src\/(layers|basemap|data|datasets)\//,
    'layer-kit': new RegExp(`^src/(map|basemap|data|datasets)/|^src/layers/(${LAYER_FILES.join('|')})\\.ts$`),
    'vector-tiles': /^src\/(core\/gpu|core\/contract|map|layers|data|datasets)|^src\/basemap\/(tile-renderer|label-renderer|labels|basemap)\.ts$/,
    basemap: /^src\/(map|layers|data|datasets)\//,
    data: /^src\/(?!data\/)/,
    geojson: /^src\/(?!data\/geojson\.ts)/,
    smaltdb: /^src\/(?!data\/)|^src\/data\/smaltcy\.ts$/,
    smaltcy: /^src\/(?!data\/)|^src\/data\/(smaltdb|geojson)\.ts$/,
    datasets: /^src\/(?!datasets\/)/,
  };
  for (const name of LAYER_FILES)
    forbidden[name] = new RegExp(`^src/(map|basemap|data|datasets)/|^src/layers/(${LAYER_FILES.filter((n) => n !== name).join('|')})\\.ts$`);

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
    const have = Object.keys(pkg.exports).filter((k) => !/worker|package\.json/.test(k));
    expect(have.sort()).toEqual(want.sort());
  });

  it('tsconfig maps every entry to its source', () => {
    for (const [name, file] of Object.entries(entries)) expect(tsconfig.compilerOptions.paths[specifier(name)], name).toEqual([`./${file}`]);
  });

  it('the guide to the pieces lists every entry', () => {
    for (const name of Object.keys(entries)) expect(guide, name).toContain(`\`${specifier(name)}\``);
  });
});
