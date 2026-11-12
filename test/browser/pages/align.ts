// Known places drawn as points over the basemap, for checking alignment by eye and by pixel.
import { createMap, basemap, scatter } from '../../../src/index.js';
const q = new URLSearchParams(location.search);
const map = await createMap(document.getElementById('map')!, { center: [-73.985, 40.758], zoom: Number(q.get('z') ?? 14), basemap: basemap({ tiles: q.get('tiles') ?? undefined }) });
// Times Square, and a point 0.01° east of it.
map.addLayer(scatter({ data: { lng: [-73.9855, -73.9755], lat: [40.758, 40.758] }, color: '#ff0000', radius: 6 }));
(window as any).map = map;
(window as any).ready = async () => { await map.idle(); return map.stats; };
(window as any).loaded = true;
