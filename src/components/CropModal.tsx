import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import styles from './CropModal.module.css';

// ── Shape types ────────────────────────────────────────────────────────────
type Shape = 'square' | 'round' | 'stamp';

// Stamp polygon from stamp_shape.svg (viewBox 304×318)
const STAMP_POINTS_STR =
  '22,33 21,45 30,53 29,59 21,65 21,75 30,83 29,89 21,94 21,105 30,113 ' +
  '28,120 21,124 21,135 30,143 29,149 21,155 21,165 30,173 29,179 21,184 ' +
  '21,195 26,198 30,204 28,210 21,215 21,225 26,228 30,234 28,240 21,244 ' +
  '21,255 26,258 30,264 29,269 21,275 22,287 34,287 41,279 46,279 52,287 ' +
  '64,287 70,279 76,279 82,287 94,287 100,279 106,279 112,287 124,287 ' +
  '131,279 136,279 142,287 154,287 160,279 166,279 172,287 184,287 191,279 ' +
  '198,280 202,287 214,287 220,279 228,280 232,287 244,287 250,279 258,280 ' +
  '262,287 275,287 275,274 267,268 268,260 275,256 275,244 267,238 268,230 ' +
  '275,226 275,214 267,208 268,200 275,196 275,184 267,178 268,170 275,166 ' +
  '275,154 267,148 268,140 275,136 275,124 267,118 268,110 275,106 275,94 ' +
  '267,88 268,80 275,76 275,64 267,58 268,50 275,46 275,33 262,33 261,37 ' +
  '256,42 249,41 244,33 232,33 230,39 226,42 219,41 214,33 202,33 201,37 ' +
  '196,42 189,41 184,33 172,33 166,42 159,41 154,33 142,33 141,37 136,42 ' +
  '129,41 124,33 112,33 111,37 106,42 99,41 94,33 82,33 81,37 76,42 69,41 ' +
  '64,33 52,33 46,42 39,41 34,33';
const STAMP_W = 304;
const STAMP_H = 318;

// SVG path string for the fill-rule:evenodd overlay (darkens area outside stamp)
// fill-rule:evenodd overlay: outer rect minus stamp polygon = darkens area outside stamp
// The outer rect is intentionally oversized so the dark fill bleeds beyond
// the SVG viewBox when overflow="visible" is set on the element.  The
// .cropArea container (overflow:hidden) clips it flush to the crop box,
// eliminating the side gaps that appear with "xMidYMid meet" scaling.
const STAMP_OVERLAY_PATH =
  `M-2000,-2000 H${STAMP_W + 2000} V${STAMP_H + 2000} H-2000 Z M` +
  STAMP_POINTS_STR.trim().split(' ').join(' L');

// ── Canvas helpers ─────────────────────────────────────────────────────────
function parseStampPoints(): [number, number][] {
  return STAMP_POINTS_STR.trim().split(' ').map(p => {
    const [x, y] = p.split(',').map(Number);
    return [x, y];
  });
}

function applyStampClip(ctx: CanvasRenderingContext2D, size: number) {
  const pts = parseStampPoints();
  const scale = Math.min(size / STAMP_W, size / STAMP_H);
  const offsetX = (size - STAMP_W * scale) / 2;
  const offsetY = (size - STAMP_H * scale) / 2;

  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const cx = x * scale + offsetX;
    const cy = y * scale + offsetY;
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.closePath();
  ctx.clip();
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  shape: Shape,
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => img.decode().then(() => resolve(img)).catch(() => resolve(img));
    img.onerror = reject;
    img.src = imageSrc;
  });

  // Cap output at 1200 px — high-res HEIC crops can exceed iOS canvas memory limits,
  // causing toDataURL() to return an empty/broken string on iPad.
  const MAX_SIZE = 1200;
  const size = Math.min(pixelCrop.width, MAX_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (shape === 'round') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
  } else if (shape === 'stamp') {
    applyStampClip(ctx, size);
  }

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, size, size,
  );

  // Square → JPEG (no transparency needed). Round/Stamp → PNG to keep transparency.
  return shape === 'square'
    ? canvas.toDataURL('image/jpeg', 0.92)
    : canvas.toDataURL('image/png');
}

// ── Shape icon SVGs ────────────────────────────────────────────────────────
function SquareIcon() {
  return (
    <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor">
      <rect x="2" y="2" width="16" height="16" rx="2" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor">
      <circle cx="10" cy="10" r="8" />
    </svg>
  );
}

function StampIcon() {
  // Clean stamp silhouette: 24×24 grid, 2 perforations per side (r=2)
  // All edges use sweep=0 so every arc bites inward (perforation into the shape)
  const d =
    'M 2 2 L 6 2 A 2 2 0 0 0 10 2 L 14 2 A 2 2 0 0 0 18 2 L 22 2 ' +
    'L 22 6 A 2 2 0 0 0 22 10 L 22 14 A 2 2 0 0 0 22 18 L 22 22 ' +
    'L 18 22 A 2 2 0 0 0 14 22 L 10 22 A 2 2 0 0 0 6 22 L 2 22 ' +
    'L 2 18 A 2 2 0 0 0 2 14 L 2 10 A 2 2 0 0 0 2 6 Z';
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d={d} />
    </svg>
  );
}

// ── Stamp overlay (darkens area outside the stamp shape in the cropper) ────
function StampOverlay() {
  return (
    <svg
      viewBox={`0 0 ${STAMP_W} ${STAMP_H}`}
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <path
        fillRule="evenodd"
        fill="rgba(0,0,0,0.55)"
        d={STAMP_OVERLAY_PATH}
      />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
interface Props {
  imageSrc: string | null;
  onConfirm: (croppedDataURL: string) => void;
  onCancel: () => void;
}

const SHAPE_OPTIONS: { value: Shape; label: string; icon: React.ReactNode }[] = [
  { value: 'stamp',  label: 'Stamp',  icon: <StampIcon /> },
  { value: 'square', label: 'Square', icon: <SquareIcon /> },
  { value: 'round',  label: 'Circle', icon: <CircleIcon /> },
];

export default function CropModal({ imageSrc, onConfirm, onCancel }: Props) {
  const [crop, setCrop]   = useState({ x: 0, y: 0 });
  const [zoom, setZoom]   = useState(1);
  const [shape, setShape] = useState<Shape>('stamp');
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Measure the crop container so we can pass its exact CSS-pixel size to
  // react-easy-crop when stamp mode is active.  This makes the crop rect
  // fill the full container, so croppedAreaPixels covers the same region
  // the stamp overlay is drawn over.
  const cropAreaRef  = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(0);

  useLayoutEffect(() => {
    if (!cropAreaRef.current) return;
    const measure = () => setContainerSize(cropAreaRef.current!.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cropAreaRef.current);
    return () => ro.disconnect();
  }, []);

  // Re-center image whenever a new src loads
  useEffect(() => {
    if (imageSrc) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [imageSrc]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels || !imageSrc) return;
    const result = await getCroppedImg(imageSrc, croppedAreaPixels, shape);
    onConfirm(result);
  };

  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <p className={styles.title}>Crop photo</p>

        {/* Shape picker */}
        <div className={styles.shapePicker}>
          {SHAPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`${styles.shapeBtn} ${shape === opt.value ? styles.shapeBtnActive : ''}`}
              title={opt.label}
              onClick={() => setShape(opt.value)}
            >
              {opt.icon}
            </button>
          ))}
        </div>

        {/* Cropper */}
        <div className={styles.cropArea} ref={cropAreaRef}>
          {imageSrc ? (
            <>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape={shape === 'round' ? 'round' : 'rect'}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                showGrid={false}
                classes={shape === 'stamp' ? { cropAreaClassName: styles.stampCropArea } : undefined}
                cropSize={
                  containerSize > 0
                    ? shape === 'square'
                      ? { width: containerSize * 0.8, height: containerSize * 0.8 }
                      : { width: containerSize, height: containerSize }
                    : undefined
                }
              />
              {shape === 'stamp' && <StampOverlay />}
            </>
          ) : (
            <div className={styles.loadingSpinner} />
          )}
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <label className={styles.zoomLabel}>
            <span>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className={styles.zoomSlider}
            />
          </label>

          <div className={styles.buttons}>
            <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
            <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!imageSrc}>Apply</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
