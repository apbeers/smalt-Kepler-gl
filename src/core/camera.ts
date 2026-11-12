/**
 * The 2D map camera: a centre in world units, a zoom level and a bearing. At zoom z the world is 512 · 2^z CSS pixels
 * wide (512-pixel tiles). Bearing is in degrees clockwise: at 90 the map's east points down the screen.
 */
import { lngToX, latToY, xToLng, yToLat, type Bounds, type LngLat } from './mercator.js';

export const TILE_SIZE = 512;
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 22;

export interface ViewState {
  /** [longitude, latitude] of the centre. */
  readonly center: LngLat;
  readonly zoom: number;
  /** Degrees clockwise. */
  readonly bearing?: number;
}

export class Camera {
  /** Centre in world units. */
  x = 0.5;
  y = 0.5;
  zoom = 1;
  /** Degrees. */
  bearing = 0;
  /** Viewport in CSS pixels. */
  width = 1;
  height = 1;
  minZoom = MIN_ZOOM;
  maxZoom = MAX_ZOOM;

  get worldSize(): number {
    return TILE_SIZE * 2 ** this.zoom;
  }

  get center(): [number, number] {
    return [xToLng(this.x), yToLat(this.y)];
  }

  setView(v: Partial<ViewState>): void {
    if (v.center) {
      this.x = lngToX(v.center[0]);
      this.y = latToY(v.center[1]);
    }
    if (v.zoom !== undefined) this.zoom = v.zoom;
    if (v.bearing !== undefined) this.bearing = v.bearing;
    this.clamp();
  }

  view(): ViewState {
    return { center: this.center, zoom: this.zoom, bearing: this.bearing };
  }

  clamp(): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.x = Math.max(0, Math.min(1, this.x));
    this.y = Math.max(0, Math.min(1, this.y));
    this.bearing = ((((this.bearing + 180) % 360) + 360) % 360) - 180;
  }

  private rot(): [number, number] {
    const r = (-this.bearing * Math.PI) / 180;
    return [Math.cos(r), Math.sin(r)];
  }

  /** CSS pixels on the canvas of a world point. */
  worldToScreen(wx: number, wy: number): [number, number] {
    const s = this.worldSize;
    const dx = (wx - this.x) * s, dy = (wy - this.y) * s;
    const [c, sn] = this.rot();
    return [dx * c - dy * sn + this.width / 2, dx * sn + dy * c + this.height / 2];
  }

  /** The world point under a CSS pixel of the canvas. */
  screenToWorld(px: number, py: number): [number, number] {
    const s = this.worldSize;
    const dx = px - this.width / 2, dy = py - this.height / 2;
    const [c, sn] = this.rot();
    // The inverse rotation.
    return [this.x + (dx * c + dy * sn) / s, this.y + (-dx * sn + dy * c) / s];
  }

  lngLatAt(px: number, py: number): [number, number] {
    const [x, y] = this.screenToWorld(px, py);
    return [xToLng(x), yToLat(y)];
  }

  /** World bounds of everything on screen (rotated corners included), plus `marginPx` on each side. */
  visibleBounds(marginPx = 0): Bounds {
    const m = marginPx;
    const pts = [
      this.screenToWorld(-m, -m),
      this.screenToWorld(this.width + m, -m),
      this.screenToWorld(-m, this.height + m),
      this.screenToWorld(this.width + m, this.height + m),
    ];
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of pts) {
      a = Math.min(a, x);
      b = Math.min(b, y);
      c = Math.max(c, x);
      d = Math.max(d, y);
    }
    return [a, b, c, d];
  }

  /** Moves by a drag of (dx, dy) CSS pixels. */
  panBy(dx: number, dy: number): void {
    const [x0, y0] = this.screenToWorld(this.width / 2, this.height / 2);
    const [x1, y1] = this.screenToWorld(this.width / 2 - dx, this.height / 2 - dy);
    this.x += x1 - x0;
    this.y += y1 - y0;
    this.clamp();
  }

  /** Zooms to `zoom` keeping the world point under (px, py) where it is on screen. */
  zoomAround(zoom: number, px: number, py: number): void {
    const [wx, wy] = this.screenToWorld(px, py);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    const [nx, ny] = this.screenToWorld(px, py);
    this.x += wx - nx;
    this.y += wy - ny;
    this.clamp();
  }

  /** Rotates about the screen point (px, py). */
  rotateAround(bearing: number, px: number, py: number): void {
    const [wx, wy] = this.screenToWorld(px, py);
    this.bearing = bearing;
    const [nx, ny] = this.screenToWorld(px, py);
    this.x += wx - nx;
    this.y += wy - ny;
    this.clamp();
  }

  /** The view that fits world bounds into the viewport with `paddingPx` around them. */
  fit(bounds: Bounds, paddingPx = 40, maxZoom = 16): ViewState {
    const [a, b, c, d] = bounds;
    const w = Math.max(c - a, 1e-9), h = Math.max(d - b, 1e-9);
    const sx = Math.max(1, this.width - 2 * paddingPx) / (w * TILE_SIZE);
    const sy = Math.max(1, this.height - 2 * paddingPx) / (h * TILE_SIZE);
    const zoom = Math.max(this.minZoom, Math.min(maxZoom, Math.log2(Math.min(sx, sy))));
    return { center: [xToLng((a + c) / 2), yToLat((b + d) / 2)], zoom, bearing: 0 };
  }

  /**
   * The numbers every shader needs, as 8 floats: scale (world size in pixels), cos and sin of the rotation, the
   * viewport's half width and height in pixels, device pixel ratio, and two spare slots the map fills (time, unused).
   */
  shaderView(pixelRatio: number, time: number): Float32Array {
    const [c, s] = this.rot();
    return new Float32Array([this.worldSize, c, s, pixelRatio, this.width / 2, this.height / 2, time, 0]);
  }
}
