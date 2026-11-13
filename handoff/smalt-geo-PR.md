# smaltgl: the docs site, tech demo, datasets and host plugins, on smaltkit

This moves smaltgl from `apbeers/smalt-Kepler-gl`, where it started, to here. The drawing code (maps on WebGPU) now lives in smaltkit as `smaltkit/geo` (ADR 0003). This repository holds the product around it:

- **`@smaltworks/smaltgl` entry points.** Each one re-exports the kit's piece of the same name.
- **What stays here:**
  - the sample datasets: rides, flights, fleet, earthquakes, ships, districts and a supply chain, generated in a worker;
  - the smaltbi plugin build: `src/hosts/smaltbi.ts` builds into `dist/smaltbi-plugin.js`.
- **The docs site.** VitePress, with:
  - runnable examples on live maps;
  - a page per dataset;
  - the tech demo;
  - ADRs.
- **`docs/integrations/smaltbi.md`.** The handoff for bringing the visuals into smaltbi, through the plugin route. For the built-in route it points to smaltkit's `docs/gpu-visuals.md`.
- **Browser tests.** Headless Chromium with WebGPU on SwiftShader, running the kit's GPU code: every layer, the basemap, selection, 3D, the plugin loaded the way smaltbi loads it, every docs example, and the demo.

Depends on: stenhoor/smaltkit#<the smaltkit PR>. Until that PR merges, `smaltkit` is pinned to the fork commit `apbeers/smaltkit#ba10e98`. After it merges, move the pin to the stenhoor/smaltkit merge commit.

## Tested

- `npm run check`: typecheck and 90 unit tests pass.
- `npm run test:browser`: 141 checks pass, run in a container.
- CI on the source repository is green for the same code (apbeers/smalt-Kepler-gl `f7b680a`).

## After merging

- Turn on GitHub Pages (source: GitHub Actions). The docs workflow deploys from `main`, and the site's base path is `/smalt-geo/`.
- Check `LICENSE`. This PR keeps this repository's MIT licence. The code came from `apbeers/smalt-Kepler-gl`, also MIT.
- Product name: the package is still `@smaltworks/smaltgl` and the docs still say smaltgl. Renaming it to match `smalt-geo` is the owner's call; smalt-brand's DECISIONS.md is where that would be recorded.
