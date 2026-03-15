import { useEffect, useRef, useState, useCallback } from 'react';
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

  const [rotation,    setRotation]    = useState(sticker.rotation ?? 0);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isSelected,  setIsSelected]  = useState(false);
  const [pos,         setPos]         = useState({ x: sticker.x * cardWidth,  y: sticker.y * cardHeight });
  const [stickerW,    setStickerW]    = useState(sticker.width  * cardWidth);
  const [stickerH,    setStickerH]    = useState(sticker.height * cardWidth);

  // Refs so gesture callbacks always read the latest values without stale closures
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
      setStickerW(sticker.width  * cardWidth);
      setStickerH(sticker.height * cardWidth);
    }
  }, [cardWidth, cardHeight, sticker.x, sticker.y, sticker.width, sticker.height]);

  // Deselect when tapping/clicking outside the sticker.
  // Uses capture phase so child stopPropagation doesn't prevent it.
  useEffect(() => {
    if (!isSelected) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [isSelected]);

  // ── TOUCH: multi-pointer gesture tracking ─────────────
  //
  // Tracks all active touch pointers on this sticker.
  // 1 pointer  → drag
  // 2 pointers → pinch (scale) + rotate, with midpoint translation
  //
  type TouchGestureState =
    | { kind: 'drag';  startPtr: { x: number; y: number }; initPos: { x: number; y: number } }
    | { kind: 'pinch'; initDist: number; initAngle: number; initW: number; initH: number; initRot: number; initMid: { x: number; y: number }; initPos: { x: number; y: number } };

  const touchPtrsRef    = useRef(new Map<number, { x: number; y: number }>());
  const touchGestureRef = useRef<TouchGestureState | null>(null);

  const commitPinchToStorage = useCallback(() => {
    onUpdate(sticker.id, {
      width:    stickerWRef.current  / cardWidth,
      height:   stickerHRef.current  / cardWidth,
      x:        posRef.current.x     / cardWidth,
      y:        posRef.current.y     / cardHeight,
      rotation: rotationRef.current,
    });
    setIsAdjusting(false);
  }, [cardHeight, cardWidth, onUpdate, sticker.id]);

  const onTouchPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();

    touchPtrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ptrs = [...touchPtrsRef.current.values()];

    if (ptrs.length === 1) {
      touchGestureRef.current = {
        kind:     'drag',
        startPtr: { x: e.clientX, y: e.clientY },
        initPos:  { ...posRef.current },
      };
    } else if (ptrs.length === 2) {
      const [p1, p2] = ptrs;
      touchGestureRef.current = {
        kind:       'pinch',
        initDist:   Math.hypot(p2.x - p1.x, p2.y - p1.y),
        initAngle:  Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI,
        initW:      stickerWRef.current,
        initH:      stickerHRef.current,
        initRot:    rotationRef.current,
        initMid:    { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        initPos:    { ...posRef.current },
      };
      setIsAdjusting(true);
    }
  }, []);

  const onTouchPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!touchPtrsRef.current.has(e.pointerId)) return;
    e.stopPropagation();
    e.preventDefault();

    touchPtrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const state = touchGestureRef.current;
    if (!state) return;

    if (state.kind === 'drag') {
      const dx   = e.clientX - state.startPtr.x;
      const dy   = e.clientY - state.startPtr.y;
      const newX = Math.max(0, Math.min(cardWidth  - stickerWRef.current, state.initPos.x + dx));
      const newY = Math.max(0, Math.min(cardHeight - stickerHRef.current, state.initPos.y + dy));
      setPos({ x: newX, y: newY });

    } else if (state.kind === 'pinch') {
      const ptrs = [...touchPtrsRef.current.values()];
      if (ptrs.length < 2) return;
      const [p1, p2] = ptrs;

      const dist  = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
      const mid   = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const scale  = state.initDist > 0 ? dist / state.initDist : 1;
      const aspect = state.initH / state.initW;
      const newW   = Math.max(32, Math.min(cardWidth * 0.85, state.initW * scale));
      const newH   = newW * aspect;
      const newRot = state.initRot + (angle - state.initAngle);

      // Translate so the sticker's center follows the midpoint of the two fingers
      const midDx  = mid.x - state.initMid.x;
      const midDy  = mid.y - state.initMid.y;
      const initCx = state.initPos.x + state.initW / 2;
      const initCy = state.initPos.y + state.initH / 2;

      setStickerW(newW);
      setStickerH(newH);
      setRotation(newRot);
      setPos({ x: initCx + midDx - newW / 2, y: initCy + midDy - newH / 2 });
    }
  }, [cardWidth, cardHeight]);

  const onTouchPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!touchPtrsRef.current.has(e.pointerId)) return;
    touchPtrsRef.current.delete(e.pointerId);
    e.stopPropagation();

    const state = touchGestureRef.current;
    const remaining = [...touchPtrsRef.current.values()];

    if (remaining.length === 0) {
      // All fingers lifted
      if (state?.kind === 'drag') {
        const dx = e.clientX - state.startPtr.x;
        const dy = e.clientY - state.startPtr.y;
        if (Math.hypot(dx, dy) < 8) {
          // Tap → toggle selection
          setIsSelected(s => !s);
        } else {
          onMove(sticker.id, posRef.current.x / cardWidth, posRef.current.y / cardHeight);
        }
      } else if (state?.kind === 'pinch') {
        commitPinchToStorage();
      }
      touchGestureRef.current = null;

    } else if (remaining.length === 1 && state?.kind === 'pinch') {
      // One finger lifted during pinch — save result, continue as drag
      commitPinchToStorage();
      touchGestureRef.current = {
        kind:     'drag',
        startPtr: remaining[0],
        initPos:  { ...posRef.current },
      };
    }
  }, [cardWidth, cardHeight, commitPinchToStorage, onMove, sticker.id]);

  const onTouchPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    touchPtrsRef.current.delete(e.pointerId);
    if (touchPtrsRef.current.size === 0) {
      touchGestureRef.current = null;
      setIsAdjusting(false);
    }
  }, []);

  // ── MOUSE: simple pointer-capture drag ───────────────
  type MouseDrag = { startX: number; startY: number; initPos: { x: number; y: number } };
  const mouseDragRef = useRef<MouseDrag | null>(null);

  const onMousePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    mouseDragRef.current = { startX: e.clientX, startY: e.clientY, initPos: { ...posRef.current } };
  }, []);

  const onMousePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = mouseDragRef.current;
    if (!s) return;
    const newX = Math.max(0, Math.min(cardWidth  - stickerWRef.current, s.initPos.x + e.clientX - s.startX));
    const newY = Math.max(0, Math.min(cardHeight - stickerHRef.current, s.initPos.y + e.clientY - s.startY));
    setPos({ x: newX, y: newY });
  }, [cardWidth, cardHeight]);

  const onMousePointerUp = useCallback((_e: React.PointerEvent<HTMLDivElement>) => {
    if (!mouseDragRef.current) return;
    mouseDragRef.current = null;
    onMove(sticker.id, posRef.current.x / cardWidth, posRef.current.y / cardHeight);
  }, [cardWidth, cardHeight, onMove, sticker.id]);

  // ── Unified pointer dispatch ──────────────────────────
  const onPointerDown   = (e: React.PointerEvent<HTMLDivElement>) =>
    e.pointerType === 'mouse' ? onMousePointerDown(e)   : onTouchPointerDown(e);
  const onPointerMove   = (e: React.PointerEvent<HTMLDivElement>) =>
    e.pointerType === 'mouse' ? onMousePointerMove(e)   : onTouchPointerMove(e);
  const onPointerUp     = (e: React.PointerEvent<HTMLDivElement>) =>
    e.pointerType === 'mouse' ? onMousePointerUp(e)     : onTouchPointerUp(e);
  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') onTouchPointerCancel(e);
  };

  // ── DESKTOP handles: rotate ───────────────────────────
  const startRotate = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const rect     = innerRef.current!.getBoundingClientRect();
    const cx       = rect.left + rect.width  / 2;
    const cy       = rect.top  + rect.height / 2;
    const initAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const initRot  = rotationRef.current;

    const onMove = (me: PointerEvent) => {
      setRotation(initRot + Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI - initAngle);
    };
    const onUp = (me: PointerEvent) => {
      const finalRot = initRot + Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI - initAngle;
      setRotation(finalRot);
      onUpdate(sticker.id, { rotation: finalRot });
      setIsAdjusting(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  }, [onUpdate, sticker.id]);

  // ── DESKTOP handles: resize ───────────────────────────
  type ResizeCorner = 'br' | 'bl' | 'tl';

  const startResize = useCallback((corner: ResizeCorner) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const startX = e.clientX,   startY = e.clientY;
    const initW  = stickerWRef.current, initH = stickerHRef.current;
    const initPos = { ...posRef.current };
    const aspect  = initH / initW;
    const θ = rotationRef.current * Math.PI / 180;
    const cosθ = Math.cos(θ), sinθ = Math.sin(θ);

    const cx  = initPos.x + initW / 2,  cy  = initPos.y + initH / 2;
    const aLX = corner === 'br' ? -initW / 2 : +initW / 2;
    const aLY = corner === 'tl' ? +initH / 2 : -initH / 2;
    const aSX = cx + aLX * cosθ - aLY * sinθ;
    const aSY = cy + aLX * sinθ + aLY * cosθ;

    const compute = (clientX: number, clientY: number) => {
      const dx = clientX - startX, dy = clientY - startY;
      const dxL =  dx * cosθ + dy * sinθ;
      const dyL = -dx * sinθ + dy * cosθ;
      const delta = corner === 'br' ? (dxL + dyL) / 2 : corner === 'bl' ? (-dxL + dyL) / 2 : (-dxL - dyL) / 2;
      const newW  = Math.max(32, Math.min(cardWidth * 0.8, initW + delta));
      const newH  = newW * aspect;
      const naLX  = corner === 'br' ? -newW / 2 : +newW / 2;
      const naLY  = corner === 'tl' ? +newH / 2 : -newH / 2;
      const newCx = aSX - (naLX * cosθ - naLY * sinθ);
      const newCy = aSY - (naLX * sinθ + naLY * cosθ);
      return { newW, newH, newPos: { x: newCx - newW / 2, y: newCy - newH / 2 } };
    };

    const onMove = (me: PointerEvent) => {
      const { newW, newH, newPos } = compute(me.clientX, me.clientY);
      setStickerW(newW); setStickerH(newH); setPos(newPos);
    };
    const onUp = (me: PointerEvent) => {
      const { newW, newH, newPos } = compute(me.clientX, me.clientY);
      setStickerW(newW); setStickerH(newH); setPos(newPos);
      onUpdate(sticker.id, { width: newW / cardWidth, height: newH / cardWidth, x: newPos.x / cardWidth, y: newPos.y / cardHeight });
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
      style={{ position: 'absolute', left: pos.x, top: pos.y, touchAction: 'none' }}
      className={`${styles.stickerWrap} ${isAdjusting ? styles.isActive : ''} ${isSelected ? styles.isSelected : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div
        ref={innerRef}
        className={styles.sticker}
        style={{ transform: `rotate(${rotation}deg)`, width: stickerW, height: stickerH, '--peel-p': `${peelP}px` } as React.CSSProperties}
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
              <img src={sticker.stickerDataURL} draggable={false} alt="" className={styles.stickerImg} />
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

        {/* Desktop-only handles — hidden on touch via @media (pointer: coarse) */}
        <div className={styles.rotateHandle} onPointerDown={startRotate} title="Rotate">↻</div>
        <div className={`${styles.resizeHandle} ${styles.resizeHandleBottomRight}`} onPointerDown={startResize('br')} title="Resize" />
        <div className={`${styles.resizeHandle} ${styles.resizeHandleBottomLeft}`} onPointerDown={startResize('bl')} title="Resize" />
        <div className={`${styles.resizeHandle} ${styles.resizeHandleUpperLeft}`}   onPointerDown={startResize('tl')} title="Resize" />

        <button
          className={styles.deleteBtn}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(sticker.id); }}
          title="Remove sticker"
        >×</button>
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
