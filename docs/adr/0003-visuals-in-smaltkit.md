# ADR 0003: The visualizations live in smaltkit

- **Status:** accepted (2026-11-13)
- **Owner's direction:** pull the visualization code into the shared kits: smaltbi will have visuals that draw data
  from the graph database, and for that it needs the visualizations in the shared kit.

## Context

[smaltkit](https://github.com/stenhoor/smaltkit) is the family's shared browser code; smaltbi and smaltui pin a
commit of it and already import its charts, tables and SVG maps from it. smaltgl's map code lived only here, and
smaltcy's WebGPU graph renderer only in smaltcy. An app that wanted either had to load a plugin file
([ADR 0002](./0002-visuals-for-hosts)) or depend on the product repositories.

## Decisions

1. **The drawing code moves to smaltkit.** smaltgl's core, map, layers, basemap, data adapters and visuals for hosts
   are `smaltkit/geo/<piece>` (folders under `src/geo/` there, one subpath per piece, the same names as smaltgl's
   entry points); smaltcy's renderer is `smaltkit/graph`. Both are written as the kit's rules ask: strict
   TypeScript, built with `tsc`, nothing imported from outside, loadable without a bundler (the tile worker sits next
   to the tile source and starts with `new URL('./tile-worker.js', import.meta.url)`).
2. **The boundaries move with the code.** The kit's `test/geo-modules.test.ts` holds the import rules that
   smaltgl's modules test held (core imports nothing else; map, layers and basemap only core; no layer another; the
   vector tile code no GPU) and checks what each subpath loads. The unit tests moved too.
3. **smaltgl keeps its entry points.** Each is one line re-exporting the kit's piece, so code that imports
   `@smaltworks/smaltgl/<name>` keeps working, and `smaltkit/geo/<name>` is the same code. smaltgl keeps what is
   its own: the sample datasets, the host adapters (`src/hosts/`, smaltbi's plugin), the docs and tech demo, and the
   browser tests, which now test the kit's code on a real WebGPU device.
4. **Pinned, like the apps.** smaltgl depends on `smaltkit` at a commit (`github:apbeers/smaltkit#8726596`, the
   branch `claude/blissful-bohr-5k2i1i` of the fork this work could push to) until it lands in stenhoor/smaltkit;
   then the pin moves there.

## Consequences

- smaltbi can draw GPU maps as built-in visuals (`import { MapVisual, VISUALS } from 'smaltkit/geo/visual'`) with
  no plugin, and graphs with `smaltkit/graph`. The plugin stays for hosts that load visuals as files.
- A change to drawing code is a smaltkit change (its rules: one task per branch and PR, a minor version for a breaking
  export), followed by a pin bump here. smaltgl's browser tests are where it meets a GPU.
- smaltcy should import its renderer from `smaltkit/graph` and drop its copy; until then the two copies are the same
  code at smaltcy's commit `f0a84e3`.
- The kit carries `src/webgpu.d.ts` (WebGPU's flag constants) while it builds with TypeScript 6.0 and 7.0; smaltgl's
  own TypeScript 7.1 has them.
