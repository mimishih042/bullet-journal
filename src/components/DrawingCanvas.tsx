import { useRef, useEffect, useCallback } from 'react';
import getStroke from 'perfect-freehand';
import { useHistoryContext } from '../context/HistoryContext';
import { saveDrawingStrokes, loadDrawingStrokes } from '../storage';
import styles from './DrawingCanvas.module.css';

export type Stroke = {
  points: [number, number, number][]; // x, y, pressure
  color: string;
  size: number;      // legacy: absolute CSS px (kept for backwards compat)
  sizeNorm?: number; // normalized: fraction of calEl width (size / scaleX at creation)
};

/** Convert perfect-freehand outline polygon to an SVG path string */
function getSvgPathFromStroke(pts: number[][]): string {
  if (!pts.length) return '';
  const d: (string | number)[] = ['M', pts[0][0], pts[0][1], 'Q'];
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  d.push('Z');
  return d.join(' ');
}

/**
 * Compute the offset and scale needed to map normalized [0,1] stroke coords
 * (relative to calEl) into CSS-pixel coords relative to the canvas top-left.
 *
 * Uses offsetLeft/offsetTop/offsetWidth/offsetHeight (CSS layout pixels) instead
 * of getBoundingClientRect so the result is completely invariant to CSS transforms
 * on ancestor elements. calEl and canvas must share the same offsetParent
 * (calendarCard, which is position:relative), which is always the case here.
 */
function getCalLayout(_canvas: HTMLCanvasElement, calEl: HTMLElement) {
  return {
    offsetX: calEl.offsetLeft,
    offsetY: calEl.offsetTop,
    scaleX:  calEl.offsetWidth,
    scaleY:  calEl.offsetHeight,
  };
}

/**
 * Render all committed strokes onto the canvas.
 * calEl is the calendar grid container (rightPanel). Normalized [0,1] coords
 * are mapped relative to that element so drawings stay anchored to the grid
 * even when the LeftPanel or overall card resizes.
 */
function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  calEl: HTMLElement | null,
) {
  const dpr    = window.devicePixelRatio || 1;
  const canvas = ctx.canvas;
  const w      = canvas.offsetWidth;
  const h      = canvas.offsetHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  if (!w || !h) return; // canvas not yet laid out — nothing to draw

  // Default: scale across full canvas (fallback if calEl not available)
  let offsetX = 0, offsetY = 0, scaleX = w, scaleY = h;
  if (calEl) {
    ({ offsetX, offsetY, scaleX, scaleY } = getCalLayout(canvas, calEl));
  }

  for (const stroke of strokes) {
    // Legacy strokes (saved before normalization) have first-point x > 1 (absolute CSS px).
    const isLegacy = stroke.points.length > 0 && stroke.points[0][0] > 1;
    const pts = isLegacy
      ? stroke.points
      : stroke.points.map(([x, y, p]) => [
          offsetX + x * scaleX,
          offsetY + y * scaleY,
          p,
        ] as [number, number, number]);
    // sizeNorm is stored as size/scaleX at draw time; multiply back to get
    // a size that scales proportionally with the layout (like stickers do).
    const displaySize = stroke.sizeNorm != null
      ? stroke.sizeNorm * scaleX
      : stroke.size; // legacy: absolute CSS px
    const outline = getStroke(pts, {
      size: displaySize,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    });
    ctx.fillStyle = stroke.color;
    ctx.fill(new Path2D(getSvgPathFromStroke(outline)));
  }
}

interface Props {
  drawMode: boolean;
  color: string;
  size: number;
  eraserMode: boolean;
  monthKey: string;
  onPinch?: (delta: number, prevMidX: number, prevMidY: number, newMidX: number, newMidY: number) => void;
  calendarRef: React.RefObject<HTMLElement>;
}

export default function DrawingCanvas({ drawMode, color, size, eraserMode, monthKey, onPinch, calendarRef }: Props) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const strokesRef      = useRef<Stroke[]>([]);
  const currentPtsRef   = useRef<[number, number, number][]>([]);
  const isDrawingRef    = useRef(false);
  const beforeEraseRef  = useRef<Stroke[] | null>(null);

  // Two-finger pinch tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const prevPinchRef      = useRef<{ dist: number; midX: number; midY: number } | null>(null);

  // Keep mutable props in refs so event handlers registered once stay current
  const colorRef        = useRef(color);
  const sizeRef         = useRef(size);
  const eraserRef       = useRef(eraserMode);
  const drawModeRef     = useRef(drawMode);
  const onPinchRef      = useRef(onPinch);
  const calendarRefRef  = useRef<HTMLElement | null>(null);
  const historyRef      = useRef(useHistoryContext());
  historyRef.current    = useHistoryContext();

  useEffect(() => { colorRef.current       = color;               }, [color]);
  useEffect(() => { sizeRef.current        = size;                }, [size]);
  useEffect(() => { eraserRef.current      = eraserMode;          }, [eraserMode]);
  useEffect(() => { drawModeRef.current    = drawMode;            }, [drawMode]);
  useEffect(() => { onPinchRef.current     = onPinch;             }, [onPinch]);
  useEffect(() => { calendarRefRef.current = calendarRef.current; }, [calendarRef]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) renderStrokes(ctx, strokesRef.current, calendarRefRef.current);
  }, []);

  // Suppress browser selection / callout / context-menu while drawing
  useEffect(() => {
    if (!drawMode) return;

    // Stamp body so global CSS can kill user-select everywhere (not just journal wrapper)
    document.body.classList.add('draw-mode-active');

    const prevent = (e: Event) => e.preventDefault();
    // Clear any selection that sneaks through (iOS force-touch bypasses selectstart)
    const clearSel = () => window.getSelection()?.removeAllRanges();

    document.addEventListener('contextmenu', prevent);
    document.addEventListener('selectstart', prevent);
    document.addEventListener('selectionchange', clearSel);

    // Prevent long-press callout/selection on the canvas ONLY — not on the whole document.
    // A document-level touchstart preventDefault would block click events on toolbar
    // buttons (undo, redo, lock, hide) because preventDefault stops the browser from
    // synthesising click from touch. Canvas touches are safe: touch-action:none means
    // the browser dispatches pointer events independently of touchstart cancellation.
    const canvas = canvasRef.current;
    const preventOnCanvas = (e: TouchEvent) => { if (e.touches.length === 1) e.preventDefault(); };
    canvas?.addEventListener('touchstart', preventOnCanvas as EventListener, { passive: false });

    return () => {
      document.body.classList.remove('draw-mode-active');
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('selectstart', prevent);
      document.removeEventListener('selectionchange', clearSel);
      canvas?.removeEventListener('touchstart', preventOnCanvas as EventListener);
    };
  }, [drawMode]);

  // Keep monthKey in a ref so save callbacks always use the current key
  const monthKeyRef = useRef(monthKey);
  useEffect(() => { monthKeyRef.current = monthKey; }, [monthKey]);

  // Load strokes from DB when month changes; migrate legacy absolute-px strokes to cal-normalized [0,1].
  useEffect(() => {
    strokesRef.current = [];
    redraw();
    loadDrawingStrokes(monthKey).then(loaded => {
      const canvas = canvasRef.current;
      const strokes = loaded as Stroke[];

      // Migrate any strokes saved before normalization (first-point x > 1 means CSS px).
      // Legacy strokes were absolute CSS px relative to the canvas top-left.
      // Convert them to cal-normalized coords using the current layout.
      if (canvas && canvas.offsetWidth > 0 && strokes.some(s => s.points[0]?.[0] > 1)) {
        const calEl = calendarRefRef.current;
        let offsetX = 0, offsetY = 0, scaleX = canvas.offsetWidth, scaleY = canvas.offsetHeight;
        if (calEl) {
          ({ offsetX, offsetY, scaleX, scaleY } = getCalLayout(canvas, calEl));
        }
        const migrated = strokes.map(stroke => {
          if (stroke.points.length === 0 || stroke.points[0][0] <= 1) return stroke;
          return {
            ...stroke,
            points: stroke.points.map(([x, y, p]) => [
              (x - offsetX) / scaleX,
              (y - offsetY) / scaleY,
              p,
            ] as [number, number, number]),
          };
        });
        strokesRef.current = migrated;
        saveDrawingStrokes(monthKey, migrated);
      } else {
        strokesRef.current = strokes;
      }
      redraw();
    });
  }, [monthKey, redraw]);

  // Sync canvas physical size to its CSS size, preserving DPR
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      canvas.width  = width  * dpr;
      canvas.height = height * dpr;
      redraw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  // Register pointer event handlers once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // CSS-pixel position of the pointer relative to the canvas top-left,
    // undoing any parent CSS-transform zoom.
    const getCssPos = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      const cssScale = r.width / canvas.offsetWidth;
      return [(e.clientX - r.left) / cssScale, (e.clientY - r.top) / cssScale];
    };

    // Normalized [0, 1] coordinates relative to the calendar grid container (calEl).
    // Using calEl (rightPanel) as the reference frame means coords remain anchored
    // to the grid even if the LeftPanel or card changes size.
    const getPoint = (e: PointerEvent): [number, number, number] => {
      const calEl = calendarRefRef.current;
      if (calEl) {
        const calRect = calEl.getBoundingClientRect();
        return [
          (e.clientX - calRect.left) / calRect.width,
          (e.clientY - calRect.top)  / calRect.height,
          e.pressure || 0.5,
        ];
      }
      // Fallback: normalize by canvas
      const [x, y] = getCssPos(e);
      return [x / canvas.offsetWidth, y / canvas.offsetHeight, e.pressure || 0.5];
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!drawModeRef.current) return;
      // Always capture so we keep events if finger slides outside canvas
      canvas.setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two fingers down → pinch mode; cancel any in-progress stroke
      if (activePointersRef.current.size >= 2) {
        isDrawingRef.current = false;
        currentPtsRef.current = [];
        prevPinchRef.current = null;
        return;
      }

      e.preventDefault();
      isDrawingRef.current = true;

      if (eraserRef.current) {
        beforeEraseRef.current = [...strokesRef.current];
        const [px, py] = getCssPos(e);
        const r = sizeRef.current * 3;
        const calEl = calendarRefRef.current;
        let offsetX = 0, offsetY = 0, scaleX = canvas.offsetWidth, scaleY = canvas.offsetHeight;
        if (calEl) ({ offsetX, offsetY, scaleX, scaleY } = getCalLayout(canvas, calEl));
        strokesRef.current = strokesRef.current.filter(s => {
          const legacy = s.points.length > 0 && s.points[0][0] > 1;
          return !s.points.some(([x, y]) => {
            const sx = legacy ? x : offsetX + x * scaleX;
            const sy = legacy ? y : offsetY + y * scaleY;
            return Math.hypot(sx - px, sy - py) < r;
          });
        });
        redraw();
        return;
      }

      currentPtsRef.current = [getPoint(e)];
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drawModeRef.current) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch + pan
      if (activePointersRef.current.size >= 2) {
        e.preventDefault();
        const pts = [...activePointersRef.current.values()];
        const dist  = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX  = (pts[0].x + pts[1].x) / 2;
        const midY  = (pts[0].y + pts[1].y) / 2;
        if (prevPinchRef.current) {
          const delta = dist / prevPinchRef.current.dist;
          onPinchRef.current?.(delta, prevPinchRef.current.midX, prevPinchRef.current.midY, midX, midY);
        }
        prevPinchRef.current = { dist, midX, midY };
        return;
      }

      if (!isDrawingRef.current) return;
      e.preventDefault();

      if (eraserRef.current) {
        const [px, py] = getCssPos(e);
        const r = sizeRef.current * 3;
        const calEl = calendarRefRef.current;
        let offsetX = 0, offsetY = 0, scaleX = canvas.offsetWidth, scaleY = canvas.offsetHeight;
        if (calEl) ({ offsetX, offsetY, scaleX, scaleY } = getCalLayout(canvas, calEl));
        const next = strokesRef.current.filter(s => {
          const legacy = s.points.length > 0 && s.points[0][0] > 1;
          return !s.points.some(([x, y]) => {
            const sx = legacy ? x : offsetX + x * scaleX;
            const sy = legacy ? y : offsetY + y * scaleY;
            return Math.hypot(sx - px, sy - py) < r;
          });
        });
        if (next.length !== strokesRef.current.length) {
          strokesRef.current = next;
          redraw();
        }
        return;
      }

      currentPtsRef.current.push(getPoint(e));

      // Draw committed strokes + live in-progress stroke (denormalize for getStroke)
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderStrokes(ctx, strokesRef.current, calendarRefRef.current);

      const calEl = calendarRefRef.current;
      let offsetX = 0, offsetY = 0, scaleX = canvas.offsetWidth, scaleY = canvas.offsetHeight;
      if (calEl) ({ offsetX, offsetY, scaleX, scaleY } = getCalLayout(canvas, calEl));
      const livePts = currentPtsRef.current.map(([x, y, p]) => [
        offsetX + x * scaleX,
        offsetY + y * scaleY,
        p,
      ] as [number, number, number]);
      const outline = getStroke(livePts, {
        size: sizeRef.current,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        last: false,
      });
      ctx.fillStyle = colorRef.current;
      ctx.fill(new Path2D(getSvgPathFromStroke(outline)));
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      prevPinchRef.current = null; // reset pinch state whenever a finger lifts

      if (!drawModeRef.current || !isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (eraserRef.current) {
        const before = beforeEraseRef.current;
        beforeEraseRef.current = null;
        if (before && before.length !== strokesRef.current.length) {
          const after = [...strokesRef.current];
          saveDrawingStrokes(monthKeyRef.current, after);
          historyRef.current.push({
            undo: () => { strokesRef.current = before; redraw(); saveDrawingStrokes(monthKeyRef.current, before); },
            redo: () => { strokesRef.current = after;  redraw(); saveDrawingStrokes(monthKeyRef.current, after);  },
          });
        }
        return;
      }

      if (currentPtsRef.current.length === 0) return;

      const calEl = calendarRefRef.current;
      let scaleX = canvas.offsetWidth;
      if (calEl) ({ scaleX } = getCalLayout(canvas, calEl));
      const newStroke: Stroke = {
        points: [...currentPtsRef.current],
        color: colorRef.current,
        size: sizeRef.current,
        sizeNorm: sizeRef.current / scaleX,
      };
      const prev = [...strokesRef.current];
      const next = [...strokesRef.current, newStroke];
      strokesRef.current = next;
      currentPtsRef.current = [];
      redraw();
      saveDrawingStrokes(monthKeyRef.current, next);

      historyRef.current.push({
        undo: () => { strokesRef.current = prev; redraw(); saveDrawingStrokes(monthKeyRef.current, prev); },
        redo: () => { strokesRef.current = next; redraw(); saveDrawingStrokes(monthKeyRef.current, next); },
      });
    };

    canvas.addEventListener('pointerdown',   onPointerDown);
    canvas.addEventListener('pointermove',   onPointerMove);
    canvas.addEventListener('pointerup',     onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown',   onPointerDown);
      canvas.removeEventListener('pointermove',   onPointerMove);
      canvas.removeEventListener('pointerup',     onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [redraw]); // handlers are stable via refs; redraw is stable via useCallback([])

  return (
    <canvas
      ref={canvasRef}
      className={[
        styles.drawingCanvas,
        drawMode        ? styles.active : '',
        drawMode && eraserMode ? styles.eraser : '',
      ].filter(Boolean).join(' ')}
    />
  );
}
