import { createMap, basemap } from '../../../src/index.js';

const q = new URLSearchParams(location.search);
const theme = (q.get('theme') ?? 'light') as 'light' | 'dark';
const tiles = q.get('tiles') ?? undefined;
const map = await createMap(document.getElementById('map')!, {
  center: [Number(q.get('lng') ?? -73.985), Number(q.get('lat') ?? 40.75)],
  zoom: Number(q.get('z') ?? 12),
  bearing: Number(q.get('bearing') ?? 0),
  basemap: basemap({ theme, tiles }),
});
(window as any).map = map;
(window as any).ready = async () => {
  await map.idle();
  return map.stats;
};
(window as any).loaded = true;
