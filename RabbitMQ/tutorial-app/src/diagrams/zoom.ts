// Pan and zoom maths for the diagram viewer. A view places the diagram's
// top-left corner at (x, y) inside the viewport and draws it at `scale`.
export type View = { scale: number; x: number; y: number };
type Size = { w: number; h: number };

export const MAX_SCALE = 4;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The largest scale that shows the whole diagram, centred, with some padding. */
export function fitView(content: Size, viewport: Size, padding = 24): View {
  if (viewport.w <= 0 || viewport.h <= 0) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min((viewport.w - padding * 2) / content.w, (viewport.h - padding * 2) / content.h);
  return { scale, x: (viewport.w - content.w * scale) / 2, y: (viewport.h - content.h * scale) / 2 };
}

/** Allow zooming out to half the fitted size, never beyond. */
export const minScaleFor = (fit: View) => Math.min(fit.scale, 1) / 2;

/** Zoom by `factor` keeping the point (px, py) of the viewport fixed under the cursor. */
export function zoomAt(view: View, factor: number, px: number, py: number, min: number, max = MAX_SCALE): View {
  const scale = clamp(view.scale * factor, min, max);
  const k = scale / view.scale;
  return { scale, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}
