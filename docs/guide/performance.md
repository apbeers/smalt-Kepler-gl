# Performance

smaltgl is built to keep work off the CPU and off the main thread:

| Step | Where it runs |
| --- | --- |
| Generating sample data | A worker; arrays are handed over without copying |
| Fetching and decoding tiles | A pool of workers |
| Projecting coordinates | Once per dataset, into 32-bit offsets from a nearby origin |
| Drawing points, arcs, paths | Instanced draws: one call per layer, the shape built in the vertex shader |
| Filters and time | Uniforms: two numbers per filter, tested in the vertex shader |
| Hexagon and grid binning | Compute shaders with atomic adds, re-run only when a filter or the cell size changes |
| Heatmap normalisation | A compute pass finds the maximum every frame; nothing read back |
| Picking | A one-pixel pass into an id target, read back only under the pointer |
| Frames | Drawn only when something changed, or while a layer animates |

## Measuring

The [tech demo](../demo) shows, for every dataset and size: the time to generate it, to load it into smaltdb or smaltcy
and query it, to upload it and draw the first frame, and each frame's CPU time, GPU time (where the browser can time
the GPU) and frames per second. **Benchmark** flies the camera through 120 frames, waiting for the GPU to finish each
one, and reports the average.

`npm run bench` runs the same tour in headless Chromium for each layer and size and prints a table. Headless runs use
SwiftShader, a CPU implementation of the GPU, so their numbers are for comparing changes, not for quoting: measure on
real hardware with the demo.

## Tips

- Pass `Float64Array` coordinates; plain arrays are converted.
- Build layers once and change them with `update`, `setFilter` and `setTime`: those don't upload anything.
- Let smaltdb choose rows with SQL, and the GPU filter what changes every frame.
- Arcs cost 32 segments each: a million arcs is 192 million vertices a frame. Filter or sample them for slow GPUs.
