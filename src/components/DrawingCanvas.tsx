import { useRef, useEffect, useCallback } from 'react';
import getStroke from 'perfect-freehand';
import { useHistoryContext } from '../context/HistoryContext';
import styles from './DrawingCanvas.module.css';

export type Stroke = {
  points: [number, number, number][]; // x, y, pressure
  color: string;
  size: number;
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

function renderStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const stroke of strokes) {
    const outline = getStroke(stroke.points, {
      size: stroke.size,
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
}

export default function DrawingCanvas({ drawMode, color, size, eraserMode, monthKey }: Props) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const strokesRef      = useRef<Stroke[]>([]);
  const currentPtsRef   = useRef<[number, number, number][]>([]);
  const isDrawingRef    = useRef(false);
  const beforeEraseRef  = useRef<Stroke[] | null>(null);

  // Keep mutable props in refs so event handlers registered once stay current
  const colorRef      = useRef(color);
  const sizeRef       = useRef(size);
  const eraserRef     = useRef(eraserMode);
  const drawModeRef   = useRef(drawMode);
  const historyRef    = useRef(useHistoryContext());
  historyRef.current  = useHistoryContext();

  useEffect(() => { colorRef.current    = color;      }, [color]);
  useEffect(() => { sizeRef.current     = size;       }, [size]);
  useEffect(() => { eraserRef.current   = eraserMode; }, [eraserMode]);
  useEffect(() => { drawModeRef.current = drawMode;   }, [drawMode]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) renderStrokes(ctx, strokesRef.current);
  }, []);

  // Clear strokes when month changes
  useEffect(() => {
    strokesRef.current = [];
    redraw();
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

    const getPoint = (e: PointerEvent): [number, number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top, e.pressure || 0.5];
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!drawModeRef.current) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;

      if (eraserRef.current) {
        beforeEraseRef.current = [...strokesRef.current];
        const [px, py] = getPoint(e);
        const r = sizeRef.current * 3;
        strokesRef.current = strokesRef.current.filter(s =>
          !s.points.some(([x, y]) => Math.hypot(x - px, y - py) < r)
        );
        redraw();
        return;
      }

      currentPtsRef.current = [getPoint(e)];
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drawModeRef.current || !isDrawingRef.current) return;
      e.preventDefault();
      const [px, py] = getPoint(e);

      if (eraserRef.current) {
        const r = sizeRef.current * 3;
        const next = strokesRef.current.filter(s =>
          !s.points.some(([x, y]) => Math.hypot(x - px, y - py) < r)
        );
        if (next.length !== strokesRef.current.length) {
          strokesRef.current = next;
          redraw();
        }
        return;
      }

      currentPtsRef.current.push(getPoint(e));

      // Draw committed strokes + live in-progress stroke
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderStrokes(ctx, strokesRef.current);

      const outline = getStroke(currentPtsRef.current, {
        size: sizeRef.current,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        last: false,
      });
      ctx.fillStyle = colorRef.current;
      ctx.fill(new Path2D(getSvgPathFromStroke(outline)));
    };

    const onPointerUp = () => {
      if (!drawModeRef.current || !isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (eraserRef.current) {
        const before = beforeEraseRef.current;
        beforeEraseRef.current = null;
        if (before && before.length !== strokesRef.current.length) {
          const after = [...strokesRef.current];
          historyRef.current.push({
            undo: () => { strokesRef.current = before; redraw(); },
            redo: () => { strokesRef.current = after;  redraw(); },
          });
        }
        return;
      }

      if (currentPtsRef.current.length === 0) return;

      const newStroke: Stroke = {
        points: [...currentPtsRef.current],
        color: colorRef.current,
        size: sizeRef.current,
      };
      const prev = [...strokesRef.current];
      const next = [...strokesRef.current, newStroke];
      strokesRef.current = next;
      currentPtsRef.current = [];
      redraw();

      historyRef.current.push({
        undo: () => { strokesRef.current = prev; redraw(); },
        redo: () => { strokesRef.current = next; redraw(); },
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
