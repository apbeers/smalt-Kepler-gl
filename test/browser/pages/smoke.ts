import { createMap, scatter } from '../../../src/index.js';

const n = 10000;
const lng = new Float64Array(n), lat = new Float64Array(n);
for (let i = 0; i < n; i++) {
  lng[i] = -10 + 20 * ((i * 0.618) % 1);
  lat[i] = -10 + 20 * ((i * 0.377) % 1);
}
const map = await createMap(document.getElementById('map')!, { center: [0, 0], zoom: 2.5 });
map.addLayer(scatter({ data: { lng, lat }, color: '#ff0000', radius: 3 }));
await map.renderNow();
(window as any).done = true;
