import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { DiagramSvg } from './DiagramSvg';
import type { DiagramSpec } from './geometry';
import { fitView, MAX_SCALE, minScaleFor, zoomAt, type View } from './zoom';

type Point = { x: number; y: number };

/** Full-screen viewer: wheel or pinch to zoom, drag to pan, double-click to zoom in, Esc to close. */
export function DiagramViewer({ spec, caption, onClose }: { spec: DiagramSpec; caption?: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const fitRef = useRef<View>(view);
  const pointers = useRef(new Map<number, Point>());

  const fit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    fitRef.current = fitView({ w: spec.width, h: spec.height }, { w: el.clientWidth, h: el.clientHeight });
    setView(fitRef.current);
  }, [spec]);

  const zoom = useCallback((factor: number, at?: Point) => {
    const el = viewportRef.current;
    const p = at ?? { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 };
    setView((v) => zoomAt(v, factor, p.x, p.y, minScaleFor(fitRef.current)));
  }, []);

  // Open as a modal, lock page scrolling behind it, and refit when the window resizes.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    else dialog?.setAttribute('open', '');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fit();
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
      document.body.style.overflow = overflow;
    };
  }, [fit]);

  // React wheel listeners are passive, so preventDefault needs a native listener.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom]);

  const close = () => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === 'function') dialog.close(); // fires onClose
    else onClose();
  };

  const local = (e: { clientX: number; clientY: number }): Point => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const next = local(e);

    if (map.size === 1) {
      // One finger or the mouse: pan.
      setView((v) => ({ ...v, x: v.x + next.x - prev.x, y: v.y + next.y - prev.y }));
    } else if (map.size === 2) {
      // Two fingers: zoom by the change in distance around their midpoint, and pan with the midpoint.
      const [other] = [...map.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      const mid0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      const mid1 = { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 };
      if (before > 0) {
        setView((v) => {
          const z = zoomAt(v, after / before, mid0.x, mid0.y, minScaleFor(fitRef.current));
          return { ...z, x: z.x + mid1.x - mid0.x, y: z.y + mid1.y - mid0.y };
        });
      }
    }
    map.set(e.pointerId, next);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === '+' || e.key === '=') zoom(1.25);
    else if (e.key === '-' || e.key === '_') zoom(0.8);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
  };

  const percent = Math.round(view.scale * 100);
  const min = minScaleFor(fitRef.current);

  return (
    <dialog ref={dialogRef} className="viewer" aria-label="Diagram viewer" onClose={onClose} onKeyDown={onKeyDown}>
      <div className="viewer-bar">
        <div className="viewer-caption">{caption ?? spec.title}</div>
        <div className="viewer-controls" role="toolbar" aria-label="Zoom controls">
          <button type="button" className="chip-btn" onClick={() => zoom(0.8)} disabled={view.scale <= min + 1e-6} aria-label="Zoom out">−</button>
          <output className="viewer-percent" aria-live="polite" aria-label="Zoom level">{percent}%</output>
          <button type="button" className="chip-btn" onClick={() => zoom(1.25)} disabled={view.scale >= MAX_SCALE - 1e-6} aria-label="Zoom in">+</button>
          <button type="button" className="chip-btn" onClick={fit}>Fit</button>
          <button type="button" className="chip-btn" onClick={() => zoom(1 / view.scale)}>100%</button>
          <button type="button" className="chip-btn" onClick={close} aria-label="Close viewer">Close</button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="viewer-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => zoom(2, local(e))}
      >
        {/* Resizing the SVG (instead of a CSS scale) keeps lines and text sharp at every zoom level. */}
        <DiagramSvg
          spec={spec}
          className="dg dg-zoomed"
          style={{ width: spec.width * view.scale, height: spec.height * view.scale, transform: `translate(${view.x}px, ${view.y}px)` }}
        />
      </div>
      <p className="viewer-hint">Scroll or pinch to zoom · drag to move · double-click to zoom in · press 0 to fit · Esc to close</p>
    </dialog>
  );
}
