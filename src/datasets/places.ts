/**
 * Real places the generated datasets are built around: approximate coordinates, rounded to about a kilometre, and
 * rough relative sizes. The data generated from them is synthetic; the geography is real so it sits on the basemap.
 */

/** [name, longitude, latitude, weight] */
export type Place = readonly [string, number, number, number];

/** New York City neighbourhoods where ride pickups cluster, weighted by rough demand. */
export const NYC_HOTSPOTS: readonly Place[] = [
  ['Midtown', -73.984, 40.754, 10],
  ['Times Square', -73.986, 40.758, 6],
  ['Financial District', -74.009, 40.707, 5],
  ['Chelsea', -74.0, 40.746, 4],
  ['Upper East Side', -73.958, 40.774, 5],
  ['Upper West Side', -73.975, 40.787, 4],
  ['Greenwich Village', -74.0, 40.733, 4],
  ['Lower East Side', -73.987, 40.715, 3],
  ['Harlem', -73.946, 40.811, 2],
  ['Williamsburg', -73.958, 40.714, 3],
  ['Downtown Brooklyn', -73.988, 40.693, 2],
  ['Park Slope', -73.979, 40.672, 1.5],
  ['Long Island City', -73.948, 40.745, 1.5],
  ['Astoria', -73.923, 40.764, 1.5],
  ['LaGuardia Airport', -73.874, 40.777, 3],
  ['JFK Airport', -73.779, 40.641, 3],
  ['Jackson Heights', -73.883, 40.751, 1],
  ['Bushwick', -73.921, 40.694, 1],
];

/** Manhattan's shores, roughly: [lat, lng] going north. Pickups in Manhattan stay between them. */
export const MANHATTAN_WEST: readonly (readonly [number, number])[] = [[40.7, -74.019], [40.75, -74.009], [40.8, -73.973], [40.85, -73.948], [40.88, -73.928]];
export const MANHATTAN_EAST: readonly (readonly [number, number])[] = [[40.7, -73.997], [40.71, -73.977], [40.74, -73.972], [40.76, -73.957], [40.79, -73.937], [40.8, -73.928], [40.83, -73.934], [40.88, -73.91]];
export const MANHATTAN = new Set(['Midtown', 'Times Square', 'Financial District', 'Chelsea', 'Upper East Side', 'Upper West Side', 'Greenwich Village', 'Lower East Side', 'Harlem']);

/** Hotspots busiest late at night. */
export const NYC_NIGHTLIFE = new Set(['Lower East Side', 'Williamsburg', 'Greenwich Village', 'Bushwick', 'Times Square']);

/** Large airports: [IATA code, longitude, latitude, rough passengers in millions a year]. */
export const AIRPORTS: readonly Place[] = [
  ['ATL', -84.43, 33.64, 104], ['DXB', 55.36, 25.25, 87], ['DFW', -97.04, 32.9, 81], ['LHR', -0.45, 51.47, 79],
  ['HND', 139.78, 35.55, 78], ['DEN', -104.67, 39.86, 77], ['IST', 28.75, 41.26, 76], ['LAX', -118.41, 33.94, 75],
  ['ORD', -87.9, 41.98, 73], ['DEL', 77.1, 28.56, 73], ['CDG', 2.55, 49.01, 67], ['JFK', -73.78, 40.64, 62],
  ['CAN', 113.3, 23.39, 63], ['AMS', 4.76, 52.31, 62], ['SIN', 103.99, 1.36, 59], ['FRA', 8.57, 50.03, 59],
  ['ICN', 126.45, 37.46, 56], ['PEK', 116.6, 40.08, 53], ['MAD', -3.57, 40.49, 60], ['BKK', 100.75, 13.69, 52],
  ['PVG', 121.8, 31.14, 55], ['SFO', -122.38, 37.62, 50], ['LAS', -115.15, 36.08, 57], ['SEA', -122.31, 47.45, 50],
  ['MIA', -80.29, 25.8, 52], ['CLT', -80.94, 35.21, 53], ['BCN', 2.08, 41.3, 50], ['MCO', -81.31, 28.43, 57],
  ['CGK', 106.65, -6.13, 50], ['KUL', 101.71, 2.75, 47], ['BOM', 72.87, 19.09, 52], ['DOH', 51.61, 25.27, 46],
  ['FCO', 12.25, 41.8, 45], ['SYD', 151.18, -33.95, 41], ['MEX', -99.07, 19.44, 48], ['GRU', -46.47, -23.43, 41],
  ['YYZ', -79.63, 43.68, 47], ['MUC', 11.79, 48.35, 41], ['EWR', -74.17, 40.69, 49], ['HKG', 113.92, 22.31, 50],
  ['NRT', 140.39, 35.77, 33], ['MNL', 121.02, 14.51, 45], ['BOG', -74.15, 4.7, 40], ['JED', 39.16, 21.68, 42],
  ['ZRH', 8.55, 47.46, 31], ['VIE', 16.57, 48.11, 30], ['CPH', 12.65, 55.62, 29], ['DUB', -6.27, 53.42, 33],
  ['LGW', -0.19, 51.15, 41], ['BOS', -71.01, 42.37, 40], ['IAH', -95.34, 29.99, 46], ['PHX', -112.01, 33.43, 48],
  ['MSP', -93.22, 44.88, 35], ['DTW', -83.35, 42.21, 32], ['YVR', -123.18, 49.19, 26], ['MEL', 144.84, -37.67, 35],
  ['AKL', 174.79, -37.01, 18], ['JNB', 28.24, -26.13, 21], ['CAI', 31.41, 30.12, 26], ['ADD', 38.8, 8.98, 12],
  ['NBO', 36.93, -1.32, 8], ['LOS', 3.32, 6.58, 8], ['CMN', -7.59, 33.37, 10], ['SCL', -70.79, -33.39, 25],
  ['LIM', -77.11, -12.02, 24], ['EZE', -58.54, -34.82, 11], ['GIG', -43.25, -22.81, 14], ['PTY', -79.38, 9.07, 18],
  ['CUN', -86.88, 21.04, 30], ['HNL', -157.92, 21.32, 21], ['ANC', -149.99, 61.17, 5], ['KEF', -22.62, 63.98, 8],
  ['OSL', 11.1, 60.19, 25], ['ARN', 17.92, 59.65, 23], ['HEL', 24.96, 60.32, 15], ['WAW', 20.97, 52.17, 18],
  ['ATH', 23.94, 37.94, 28], ['LIS', -9.14, 38.77, 33], ['TLV', 34.89, 32.01, 21], ['RUH', 46.7, 24.96, 30],
  ['AUH', 54.65, 24.43, 23], ['KHI', 67.16, 24.91, 8], ['BLR', 77.71, 13.2, 37], ['MAA', 80.17, 12.99, 22],
  ['CCU', 88.45, 22.65, 19], ['DAC', 90.4, 23.84, 10], ['CMB', 79.88, 7.18, 8], ['SGN', 106.66, 10.82, 38],
  ['HAN', 105.81, 21.22, 28], ['TPE', 121.23, 25.08, 35], ['KIX', 135.24, 34.43, 25], ['CTU', 103.95, 30.57, 45],
  ['SZX', 113.81, 22.64, 52], ['XIY', 108.75, 34.45, 41], ['PER', 115.97, -31.94, 14], ['BNE', 153.12, -27.38, 22],
];

/** Container ports: [name, longitude, latitude, rough throughput in millions of containers a year]. */
export const PORTS: readonly Place[] = [
  ['Shanghai', 121.98, 30.63, 49], ['Singapore', 103.84, 1.26, 39], ['Ningbo', 121.88, 29.94, 35], ['Shenzhen', 113.89, 22.48, 30],
  ['Qingdao', 120.3, 36.07, 26], ['Guangzhou', 113.6, 22.75, 25], ['Busan', 129.04, 35.1, 23], ['Tianjin', 117.79, 38.98, 21],
  ['Hong Kong', 114.12, 22.33, 15], ['Rotterdam', 4.05, 51.95, 14], ['Dubai (Jebel Ali)', 55.06, 25.01, 14], ['Port Klang', 101.31, 2.99, 14],
  ['Antwerp', 4.3, 51.29, 13], ['Xiamen', 118.07, 24.45, 12], ['Kaohsiung', 120.28, 22.6, 9], ['Los Angeles', -118.26, 33.73, 9],
  ['Hamburg', 9.93, 53.53, 8], ['Long Beach', -118.21, 33.75, 9], ['New York', -74.14, 40.67, 9], ['Tanjung Pelepas', 103.55, 1.36, 10],
  ['Laem Chabang', 100.88, 13.08, 8], ['Colombo', 79.84, 6.95, 7], ['Algeciras', -5.44, 36.13, 5], ['Valencia', -0.31, 39.44, 5],
  ['Piraeus', 23.61, 37.94, 5], ['Santos', -46.3, -23.97, 5], ['Savannah', -81.1, 32.08, 6], ['Mumbai (Nhava Sheva)', 72.95, 18.95, 6],
  ['Jeddah', 39.16, 21.48, 5], ['Tokyo', 139.8, 35.62, 4], ['Felixstowe', 1.33, 51.95, 4], ['Durban', 31.02, -29.87, 3],
  ['Melbourne', 144.92, -37.83, 3], ['Vancouver', -123.08, 49.29, 3], ['Manzanillo', -104.31, 19.06, 3], ['Panama (Balboa)', -79.57, 8.95, 3],
];

/** Waypoints ships pass through, so lanes bend around continents: [name, longitude, latitude]. */
export const SEA_WAYPOINTS: Record<string, readonly [number, number]> = {
  malacca: [100.5, 3.5],
  sriLanka: [80.5, 5.5],
  babElMandeb: [43.4, 12.6],
  suez: [32.55, 30.0],
  sicily: [12.0, 36.8],
  gibraltar: [-5.6, 35.95],
  finisterre: [-10.0, 43.5],
  channel: [-1.5, 50.2],
  capeGoodHope: [18.5, -35.2],
  panama: [-79.6, 9.2],
  hawaii: [-157, 22],
  luzon: [121.5, 20.5],
  tsugaru: [141.0, 41.5],
  aleutians: [-170, 50],
  floridaStrait: [-80.5, 24.5],
  hatteras: [-74.5, 35.0],
  azores: [-28, 38.5],
};

/** Plate boundaries, roughly: where most earthquakes are. Each is a polyline of [longitude, latitude]. */
export const FAULTS: readonly { readonly name: string; readonly weight: number; readonly line: readonly (readonly [number, number])[] }[] = [
  { name: 'Japan and Kuril trenches', weight: 10, line: [[130.5, 31], [133, 33], [137.5, 34], [141, 36], [142.5, 39], [144, 42], [147, 44], [152, 46.5], [157, 50.5], [160, 53]] },
  { name: 'Aleutian arc', weight: 6, line: [[162, 55], [170, 52.5], [178, 51.5], [-175, 51.5], [-165, 53.5], [-158, 55.5], [-150, 59.5]] },
  { name: 'Western North America', weight: 4, line: [[-136, 58], [-130, 52], [-127, 48], [-124.5, 43], [-124, 40], [-122, 37.5], [-118.5, 34.5], [-116, 32.5], [-114, 30]] },
  { name: 'Middle America trench', weight: 5, line: [[-106, 20], [-102, 17.5], [-98, 16], [-94, 15], [-91, 13.5], [-87, 12.5], [-85, 10], [-83, 8]] },
  { name: 'Andes', weight: 8, line: [[-78, 2], [-80, -2], [-81, -6], [-79, -10], [-76, -14], [-71.5, -18], [-70.5, -23], [-71.5, -30], [-73, -36], [-74, -42], [-75, -46]] },
  { name: 'Caribbean', weight: 2, line: [[-62, 10.5], [-61, 14], [-62, 17], [-65, 19], [-69, 19.5], [-73, 19.8], [-77, 19.5]] },
  { name: 'Indonesia (Sunda arc)', weight: 9, line: [[95, 6], [96.5, 3], [99, -1], [101.5, -4], [105, -7], [110, -9], [115, -10], [120, -10], [125, -8], [129, -6]] },
  { name: 'Philippines', weight: 5, line: [[126.5, 6], [127, 9], [126, 12], [124, 14], [122, 16], [121.5, 19], [122, 22], [121.5, 24.5]] },
  { name: 'Tonga and Kermadec', weight: 7, line: [[-173.5, -15], [-174, -18], [-175, -21], [-176, -25], [-177, -29], [-178.5, -33], [178, -37.5], [176, -40]] },
  { name: 'Vanuatu and Solomons', weight: 5, line: [[146, -6], [151, -6.5], [155, -7], [159, -10], [163, -11.5], [167, -14.5], [169, -19], [171, -22]] },
  { name: 'Alpide belt', weight: 5, line: [[-9, 36.5], [0, 37], [10, 38], [15, 38.5], [20, 39], [23, 38], [27, 37.5], [32, 38.5], [38, 38.5], [44, 37], [50, 34], [57, 28], [62, 30], [67, 33], [71, 36], [75, 35.5], [80, 31], [85, 28.5], [90, 28], [95, 27.5]] },
  { name: 'Mid-Atlantic Ridge', weight: 2, line: [[-17, 66], [-28, 58], [-30, 50], [-28.5, 40], [-38, 30], [-45, 23], [-46, 15], [-38, 7], [-25, 0], [-14, -8], [-13, -20], [-14, -32], [-16, -45]] },
  { name: 'East African Rift', weight: 1, line: [[40, 13], [41, 9], [38, 7], [37, 3], [36, 0], [35, -4], [34, -8], [35, -12]] },
];

/** London: centre and depots for the delivery fleet. */
export const LONDON = { centre: [-0.118, 51.509] as const, depots: [[-0.02, 51.5], [-0.3, 51.55], [0.08, 51.56], [-0.2, 51.45], [-0.11, 51.61]] as const };

/** Chicago, for the district map. */
export const CHICAGO = { centre: [-87.68, 41.84] as const };

/** Supply chain sites: [name, longitude, latitude, kind]. Kinds: supplier, factory, warehouse, store. */
export const SUPPLY_SITES: readonly (readonly [string, number, number, 'supplier' | 'factory' | 'warehouse'])[] = [
  ['Shenzhen components', 114.06, 22.54, 'supplier'], ['Taipei chips', 121.56, 25.03, 'supplier'], ['Penang assembly', 100.33, 5.41, 'supplier'],
  ['Seoul displays', 126.98, 37.57, 'supplier'], ['Osaka sensors', 135.5, 34.69, 'supplier'], ['Pune castings', 73.86, 18.52, 'supplier'],
  ['Monterrey plant', -100.31, 25.69, 'factory'], ['Guadalajara plant', -103.35, 20.67, 'factory'], ['Ho Chi Minh plant', 106.63, 10.82, 'factory'],
  ['Brno plant', 16.61, 49.2, 'factory'], ['Shanghai plant', 121.47, 31.23, 'factory'],
  ['Memphis hub', -89.97, 35.15, 'warehouse'], ['Reno hub', -119.81, 39.53, 'warehouse'], ['Allentown hub', -75.47, 40.6, 'warehouse'],
  ['Dallas hub', -96.8, 32.78, 'warehouse'], ['Venlo hub', 6.17, 51.37, 'warehouse'], ['Leipzig hub', 12.37, 51.34, 'warehouse'],
  ['Madrid hub', -3.7, 40.42, 'warehouse'], ['Tokyo hub', 139.69, 35.69, 'warehouse'], ['Sydney hub', 151.21, -33.87, 'warehouse'],
];

/** Cities with stores, for the supply chain: [name, longitude, latitude, weight]. */
export const STORE_CITIES: readonly Place[] = [
  ['New York', -74.0, 40.71, 9], ['Los Angeles', -118.24, 34.05, 7], ['Chicago', -87.63, 41.88, 5], ['Houston', -95.37, 29.76, 4],
  ['Phoenix', -112.07, 33.45, 3], ['Philadelphia', -75.17, 39.95, 3], ['San Francisco', -122.42, 37.77, 4], ['Seattle', -122.33, 47.61, 3],
  ['Denver', -104.99, 39.74, 2], ['Atlanta', -84.39, 33.75, 3], ['Miami', -80.19, 25.76, 3], ['Boston', -71.06, 42.36, 3],
  ['Toronto', -79.38, 43.65, 3], ['Mexico City', -99.13, 19.43, 5], ['London', -0.13, 51.51, 6], ['Paris', 2.35, 48.86, 5],
  ['Berlin', 13.4, 52.52, 3], ['Madrid', -3.7, 40.42, 3], ['Milan', 9.19, 45.46, 3], ['Amsterdam', 4.9, 52.37, 2],
  ['Stockholm', 18.07, 59.33, 2], ['Warsaw', 21.01, 52.23, 2], ['Tokyo', 139.69, 35.69, 7], ['Sydney', 151.21, -33.87, 3],
  ['Melbourne', 144.96, -37.81, 2], ['Osaka', 135.5, 34.69, 3],
];
