/** The shapes generated datasets come in. */

/** Column data: every column has one entry per row (points, arcs) or per path or polygon. */
export type Columns = Record<string, Float64Array | Float32Array | Uint32Array>;

export interface PointsDataset {
  readonly kind: 'points';
  readonly count: number;
  /** lng and lat, plus value columns. */
  readonly columns: Columns;
  /** Names for coded columns: column → names by code. */
  readonly categories?: Readonly<Record<string, readonly string[]>>;
}

export interface ArcsDataset {
  readonly kind: 'arcs';
  readonly count: number;
  /** sourceLng, sourceLat, targetLng, targetLat, plus value columns. */
  readonly columns: Columns;
  readonly categories?: Readonly<Record<string, readonly string[]>>;
  /** The places the arcs join, as points. */
  readonly places?: { readonly lng: Float64Array; readonly lat: Float64Array; readonly weight: Float32Array; readonly names: readonly string[] };
}

export interface PathsDataset {
  readonly kind: 'paths';
  /** Paths. */
  readonly count: number;
  /** Offsets of each path's first point, plus the end. */
  readonly starts: Uint32Array;
  /** lng, lat and times, one entry per point. */
  readonly points: { readonly lng: Float64Array; readonly lat: Float64Array; readonly times: Float64Array };
  /** One entry per path. */
  readonly columns: Columns;
  readonly categories?: Readonly<Record<string, readonly string[]>>;
}

export interface PolygonsDataset {
  readonly kind: 'polygons';
  readonly count: number;
  readonly starts: Uint32Array;
  readonly points: { readonly lng: Float64Array; readonly lat: Float64Array };
  /** One entry per polygon. */
  readonly columns: Columns;
}

export type Dataset = PointsDataset | ArcsDataset | PathsDataset | PolygonsDataset;
