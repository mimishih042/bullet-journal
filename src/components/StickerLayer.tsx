import { useEffect, useRef, useState, useCallback } from 'react';
import { useGesture } from '@use-gesture/react';
import styles from './StickerLayer.module.css';
import type { PlacedSticker } from '../storage';

interface PlacedStickerItemProps {
  sticker: PlacedSticker;
  cardWidth: number;
  cardHeight: number;
  onMove: (id: string, xFrac: number, yFrac: number) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PlacedSticker>) => void;
}

function PlacedStickerItem({ sticker, cardWidth, cardHeight, onMove, onDelete, onUpdate }: PlacedStickerItemProps) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const [rotation,   setRotation]   = useState(sticker.rotation ?? 0);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isSelected,  setIsSelected]  = useState(false);

  const [pos,      setPos]      = useState({ x: sticker.x * cardWidth,    y: sticker.y * cardHeight });
  const [stickerW, setStickerW] = useState(sticker.width * cardWidth);
  const [stickerH, setStickerH] = useState(sticker.height * cardWidth);

  // Keep refs in sync so gesture callbacks always see latest values
  const posRef      = useRef(pos);
  const stickerWRef = useRef(stickerW);
  const stickerHRef = useRef(stickerH);
  const rotationRef = useRef(rotation);

  useEffect(() => { posRef.current      = pos;      }, [pos]);
  useEffect(() => { stickerWRef.current = stickerW; }, [stickerW]);
  useEffect(() => { stickerHRef.current = stickerH; }, [stickerH]);
  useEffect(() => { rotationRef.current = rotation; }, [rotation]);

  useEffect(() => {
    if (cardWidth > 0 && cardHeight > 0) {
      setPos({ x: sticker.x * cardWidth, y: sticker.y * cardHeight });
      setStickerW(sticker.width * cardWidth);
      setStickerH(sticker.height * cardWidth);
    }
  }, [cardWidth, cardHeight, sticker.x, sticker.y, sticker.width, sticker.height]);

  // Deselect when clicking elsewhere
  useEffect(() => {
    if (!isSelected) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [isSelected]);

  // ── Gesture: drag + pinch ─────────────────────────────
  const isPinchingRef = useRef(false);

  const bind = useGesture(
    {
      onDrag: ({ movement: [mx, my], first, last, tap, cancel, memo, event }) => {
        // tap = select sticker
        if (tap) {
          setIsSelected(s => !s);
          return;
        }

        // Don't drag while pinching
        if (isPinchingRef.current) { cancel?.(); return; }

        event?.stopPropagation();


        // Capture the initial position once at drag start
        const initPos = first ? posRef.current : (memo as { x: number; y: number });

        const newX = Math.max(0, Math.min(cardWidth  - stickerWRef.current, initPos.x + mx));
        const newY = Math.max(0, Math.min(cardHeight - stickerHRef.current, initPos.y + my));

        setPos({ x: newX, y: newY });

        if (last) {
          onMove(sticker.id, newX / cardWidth, newY / cardHeight);
        }

        return initPos;
      },

      onPinch: ({ da: [d, a], first, last, memo, event }) => {
        event?.stopPropagation();
        isPinchingRef.current = !last;

        if (first) {
          setIsAdjusting(true);
          return { initW: stickerWRef.current, initH: stickerHRef.current, initRot: rotationRef.current, initD: d, initA: a };
        }

        if (!memo) return;
        const { initW, initH, initRot, initD, initA } = memo as {
          initW: number; initH: number; initRot: number; initD: number; initA: number;
        };

        const scale = initD > 0 ? d / initD : 1;
        const aspect = initH / initW;
        const newW = Math.max(32, Math.min(cardWidth * 0.85, initW * scale));
        const newH = newW * aspect;
        const newRot = initRot + (a - initA);

        setStickerW(newW);
        setStickerH(newH);
        setRotation(newRot);

        if (last) {
          setIsAdjusting(false);
          onUpdate(sticker.id, {
            width:    newW / cardWidth,
            height:   newH / cardWidth,
            x:        posRef.current.x / cardWidth,
            y:        posRef.current.y / cardHeight,
            rotation: newRot,
          });
        }

        return memo;
      },
    },
    {
      drag: {
        // Use the sticker's current position as the origin so movement
        // is always measured relative to where the drag started.
        from: () => [0, 0] as [number, number],
        filterTaps: true,
        tapsThreshold: 5,
        threshold: 4,
      },
      pinch: {
        scaleBounds: { min: 0.05, max: 10 },
      },
    },
  );

  // ── Rotate (pointer-events — works on mouse + touch) ──
  const startRotate = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const rect = innerRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const initAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const initRot   = rotationRef.current;

    const target = e.currentTarget as Element;
    (target as any).setPointerCapture?.(e.pointerId);

    const onMove = (me: PointerEvent) => {
      const angle = Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI;
      setRotation(initRot + (angle - initAngle));
    };

    const onUp = (me: PointerEvent) => {
      const angle    = Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI;
      const finalRot = initRot + (angle - initAngle);
      setRotation(finalRot);
      onUpdate(sticker.id, { rotation: finalRot });
      setIsAdjusting(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  }, [onUpdate, sticker.id]);

  // ── Resize (pointer-events — works on mouse + touch) ──
  type ResizeCorner = 'br' | 'bl' | 'tl';

  const startResize = useCallback((corner: ResizeCorner) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const startX  = e.clientX;
    const startY  = e.clientY;
    const initW   = stickerWRef.current;
    const initH   = stickerHRef.current;
    const initPos = { ...posRef.current };
    const aspect  = initH / initW;
    const θ       = rotationRef.current * Math.PI / 180;
    const cosθ    = Math.cos(θ);
    const sinθ    = Math.sin(θ);

    const cx  = initPos.x + initW / 2;
    const cy  = initPos.y + initH / 2;
    const aLX = corner === 'br' ? -initW / 2 : +initW / 2;
    const aLY = corner === 'tl' ? +initH / 2 : -initH / 2;
    const aSX = cx + aLX * cosθ - aLY * sinθ;
    const aSY = cy + aLX * sinθ + aLY * cosθ;

    const compute = (clientX: number, clientY: number) => {
      const dx  = clientX - startX;
      const dy  = clientY - startY;
      const dxL =  dx * cosθ + dy * sinθ;
      const dyL = -dx * sinθ + dy * cosθ;
      const delta =
        corner === 'br' ? ( dxL + dyL) / 2 :
        corner === 'bl' ? (-dxL + dyL) / 2 :
                          (-dxL - dyL) / 2;
      const newW   = Math.max(32, Math.min(cardWidth * 0.8, initW + delta));
      const newH   = newW * aspect;
      const naLX   = corner === 'br' ? -newW / 2 : +newW / 2;
      const naLY   = corner === 'tl' ? +newH / 2 : -newH / 2;
      const newCx  = aSX - (naLX * cosθ - naLY * sinθ);
      const newCy  = aSY - (naLX * sinθ + naLY * cosθ);
      const newPos = { x: newCx - newW / 2, y: newCy - newH / 2 };
      return { newW, newH, newPos };
    };

    const onMove = (me: PointerEvent) => {
      const { newW, newH, newPos } = compute(me.clientX, me.clientY);
      setStickerW(newW);
      setStickerH(newH);
      setPos(newPos);
    };

    const onUp = (me: PointerEvent) => {
      const { newW, newH, newPos } = compute(me.clientX, me.clientY);
      setStickerW(newW);
      setStickerH(newH);
      setPos(newPos);
      onUpdate(sticker.id, {
        width:  newW / cardWidth,
        height: newH / cardWidth,
        x:      newPos.x / cardWidth,
        y:      newPos.y / cardHeight,
      });
      setIsAdjusting(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  }, [cardWidth, cardHeight, onUpdate, sticker.id]);

  // ── Peel padding ──────────────────────────────────────
  const PEEL_SIN = Math.sin(67 * Math.PI / 180);
  const PEEL_COS = Math.cos(67 * Math.PI / 180);
  const peelP = Math.max(
    10,
    Math.ceil((PEEL_SIN * Math.max(stickerW, stickerH) - PEEL_COS * Math.min(stickerW, stickerH)) / 2) + 4,
  );

  const backFilterId = `stickerBack-${sticker.id}`;

  return (
    <div
      ref={wrapRef}
      {...bind()}
      style={{ position: 'absolute', left: pos.x, top: pos.y, touchAction: 'none' }}
      className={`${styles.stickerWrap}
        ${isAdjusting  ? styles.isActive   : ''}
        ${isSelected   ? styles.isSelected : ''}
      `}
    >
      <div
        ref={innerRef}
        className={styles.sticker}
        style={{
          transform: `rotate(${rotation}deg)`,
          width:  stickerW,
          height: stickerH,
          '--peel-p': `${peelP}px`,
        } as React.CSSProperties}
      >
        <svg width="0" height="0" className={styles.filterSvg}>
          <defs>
            <filter id={backFilterId}>
              <feOffset dx="0" dy="0" in="SourceAlpha" result="shape" />
              <feFlood floodColor="rgb(221 214 200)" result="flood" />
              <feComposite operator="in" in="flood" in2="shape" />
            </filter>
          </defs>
        </svg>

        <div className={styles.peelContainer}>
          <div className={styles.stickerMain}>
            <div className={styles.stickerMainInner}>
              <img
                src={sticker.stickerDataURL}
                draggable={false}
                alt=""
                className={styles.stickerImg}
              />
            </div>
          </div>

          <div className={styles.stickerFlap}>
            <div className={styles.stickerFlapInner}>
              <img
                src={sticker.stickerDataURL}
                draggable={false}
                alt=""
                className={styles.stickerFlapImg}
                style={{ filter: `url(#${backFilterId})` }}
              />
            </div>
          </div>
        </div>

        {/* Rotate handle */}
        <div
          className={styles.rotateHandle}
          onPointerDown={startRotate}
          title="Rotate"
        >
          ↻
        </div>

        {/* Resize handles */}
        <div
          className={`${styles.resizeHandle} ${styles.resizeHandleBottomRight}`}
          onPointerDown={startResize('br')}
          title="Resize"
        />
        <div
          className={`${styles.resizeHandle} ${styles.resizeHandleBottomLeft}`}
          onPointerDown={startResize('bl')}
          title="Resize"
        />
        <div
          className={`${styles.resizeHandle} ${styles.resizeHandleUpperLeft}`}
          onPointerDown={startResize('tl')}
          title="Resize"
        />

        <button
          className={styles.deleteBtn}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(sticker.id); }}
          title="Remove sticker"
        >
          ×
        </button>
      </div>
    </div>
  );
}

interface Props {
  stickers: PlacedSticker[];
  cardWidth: number;
  cardHeight: number;
  onMove: (id: string, xFrac: number, yFrac: number) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PlacedSticker>) => void;
}

export default function StickerLayer({ stickers, cardWidth, cardHeight, onMove, onDelete, onUpdate }: Props) {
  return (
    <div className={styles.stickerLayer}>
      {stickers.map(sticker => (
        <PlacedStickerItem
          key={sticker.id}
          sticker={sticker}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          onMove={onMove}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
