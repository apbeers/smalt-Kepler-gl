---
layout: page
title: Tech demo
sidebar: false
aside: false
---

<div class="gl-demo-page">

<h1 class="gl-demo-title">Tech demo: real-world data, small to huge</h1>

<p class="gl-demo-lead">Pick a dataset and a size, from ten thousand rows to ten million. The data is generated in your
browser, in a worker, with the shape of the real thing: rides in New York, flights between airports, a delivery fleet
in London, earthquakes, ships, city districts, and a supply chain graph. Switch layers, colour and filter on the GPU,
play time, and press Benchmark to time a camera tour. Every number is measured on your machine.</p>

<ClientOnly>
  <TechDemo />
</ClientOnly>

</div>

<style>
.gl-demo-page { padding: 20px 24px; }
.gl-demo-title { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 6px; }
.gl-demo-lead { max-width: 80ch; color: var(--vp-c-text-2); margin: 0 0 16px; }
@media (max-width: 640px) { .gl-demo-page { padding: 12px 16px; } }
</style>
