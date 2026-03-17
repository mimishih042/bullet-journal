import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './StickerLayer.module.css';
import type { PlacedSticker } from '../storage';

// Module-level mutex: only one sticker may own a touch gesture at a time.
// Prevents two nearby/overlapping stickers from both responding to the same gesture.
let activeTouchEl: Element | null = null;

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

  // ── All mutable values in refs so native event callbacks are stable ──
  const posRef        = useRef(pos);
  const stickerWRef   = useRef(stickerW);
  const stickerHRef   = useRef(stickerH);
  const rotationRef   = useRef(rotation);
  const cardWidthRef  = useRef(cardWidth);
  const cardHeightRef = useRef(cardHeight);
  const onMoveRef     = useRef(onMove);
  const onUpdateRef   = useRef(onUpdate);
  const stickerIdRef  = useRef(sticker.id);
  const isSelectedRef = useRef(isSelected);

  useEffect(() => { posRef.current        = pos;         }, [pos]);
  useEffect(() => { stickerWRef.current   = stickerW;    }, [stickerW]);
  useEffect(() => { stickerHRef.current   = stickerH;    }, [stickerH]);
  useEffect(() => { rotationRef.current   = rotation;    }, [rotation]);
  useEffect(() => { cardWidthRef.current  = cardWidth;   }, [cardWidth]);
  useEffect(() => { cardHeightRef.current = cardHeight;  }, [cardHeight]);
  useEffect(() => { onMoveRef.current     = onMove;      }, [onMove]);
  useEffect(() => { onUpdateRef.current   = onUpdate;    }, [onUpdate]);
  useEffect(() => { isSelectedRef.current = isSelected;  }, [isSelected]);

  useEffect(() => {
    if (cardWidth > 0 && cardHeight > 0) {
      setPos({ x: sticker.x * cardWidth, y: sticker.y * cardHeight });
      setStickerW(sticker.width  * cardWidth);
      setStickerH(sticker.height * cardWidth);
    }
  }, [cardWidth, cardHeight, sticker.x, sticker.y, sticker.width, sticker.height]);

  // Deselect when tapping/clicking outside this sticker.
  // Capture phase ensures child stopPropagation doesn't prevent it.
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

  // ── TOUCH gestures via native Touch Events ────────────────────────
  //
  // Why native (not pointer events / React synthetic events)?
  //   • TouchEvent.touches is an array of ALL active contacts — perfect for pinch.
  //   • { passive: false } lets us call preventDefault() to block iOS page-zoom.
  //   • Avoids React event-delegation quirks that can drop 2nd-finger pointerdown.
  //
  // Gesture states:
  //   'drag'  — one finger: translate the sticker
  //   'pinch' — two fingers: scale + rotate + translate (midpoint tracking)
  //
  type DragState  = { kind: 'drag';  touchId: number; startX: number; startY: number; startTime: number; initPos: { x: number; y: number } };
  type PinchState = { kind: 'pinch'; initDist: number; initAngle: number; initW: number; initH: number; initRot: number; initMid: { x: number; y: number }; initPos: { x: number; y: number } };
  type GestureState = DragState | PinchState;

  const gestureRef = useRef<GestureState | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    // ── Helpers ──────────────────────────────────────────
    const makeDrag = (t: Touch): DragState => {
      setIsAdjusting(true);
      return {
        kind:      'drag',
        touchId:   t.identifier,
        startX:    t.clientX,
        startY:    t.clientY,
        startTime: Date.now(),
        initPos:   { ...posRef.current },
      };
    };

    const makePinch = (t1: Touch, t2: Touch): PinchState => {
      setIsAdjusting(true);
      return {
        kind:      'pinch',
        initDist:  Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        initAngle: Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI,
        initW:     stickerWRef.current,
        initH:     stickerHRef.current,
        initRot:   rotationRef.current,
        initMid:   { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 },
        initPos:   { ...posRef.current },
      };
    };

    const applyPinch = (s: PinchState, t1: Touch, t2: Touch) => {
      const dist  = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
      const mid   = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };

      const scale  = s.initDist > 0 ? dist / s.initDist : 1;
      const newW   = Math.max(32, Math.min(cardWidthRef.current * 0.85, s.initW * scale));
      const newH   = newW * (s.initH / s.initW);
      const newRot = s.initRot + (angle - s.initAngle);

      // Sticker center follows the midpoint of the two fingers
      const newCx = s.initPos.x + s.initW / 2 + (mid.x - s.initMid.x);
      const newCy = s.initPos.y + s.initH / 2 + (mid.y - s.initMid.y);

      setStickerW(newW);
      setStickerH(newH);
      setRotation(newRot);
      setPos({ x: newCx - newW / 2, y: newCy - newH / 2 });
    };

    const commitPinch = () => {
      onUpdateRef.current(stickerIdRef.current, {
        width:    stickerWRef.current  / cardWidthRef.current,
        height:   stickerHRef.current  / cardWidthRef.current,
        x:        posRef.current.x     / cardWidthRef.current,
        y:        posRef.current.y     / cardHeightRef.current,
        rotation: rotationRef.current,
      });
      setIsAdjusting(false);
    };

    // ── Document-level move / end listeners (survive finger leaving element) ──
    let docMove:   ((e: TouchEvent) => void) | null = null;
    let docEnd:    ((e: TouchEvent) => void) | null = null;
    let docCancel: (() => void) | null = null;

    const detach = () => {
      if (docMove)   document.removeEventListener('touchmove',   docMove);
      if (docEnd)    document.removeEventListener('touchend',    docEnd);
      if (docCancel) document.removeEventListener('touchcancel', docCancel);
      docMove = docEnd = docCancel = null;
      if (activeTouchEl === el) activeTouchEl = null;
    };

    const attach = () => {
      detach();

      docMove = (e: TouchEvent) => {
        e.preventDefault();   // block iOS page-scroll / pinch-zoom
        const s = gestureRef.current;
        if (!s) return;

        if (e.touches.length >= 2) {
          // If we were dragging, transition to pinch when 2nd finger appears
          if (s.kind === 'drag') {
            gestureRef.current = makePinch(e.touches[0], e.touches[1]);
            return;
          }
          applyPinch(s, e.touches[0], e.touches[1]);

        } else if (s.kind === 'drag') {
          // Find the specific finger that started this drag (ignore other active touches)
          const t = Array.from(e.touches).find(t => t.identifier === s.touchId);
          if (!t) return;
          const cw = cardWidthRef.current;
          const ch = cardHeightRef.current;
          const newX = Math.max(0, Math.min(cw - stickerWRef.current,  s.initPos.x + t.clientX - s.startX));
          const newY = Math.max(0, Math.min(ch - stickerHRef.current, s.initPos.y + t.clientY - s.startY));
          setPos({ x: newX, y: newY });
        }
      };

      docEnd = (e: TouchEvent) => {
        const s = gestureRef.current;

        if (e.touches.length === 0) {
          // All fingers lifted
          if (s?.kind === 'drag') {
            setIsAdjusting(false);
            const ct = e.changedTouches[0];
            const dx = ct.clientX - s.startX;
            const dy = ct.clientY - s.startY;
            if (Math.hypot(dx, dy) < 8 && Date.now() - s.startTime < 400) {
              // Tap → toggle selection (shows/hides delete button)
              setIsSelected(prev => !prev);
            } else {
              onMoveRef.current(stickerIdRef.current,
                posRef.current.x / cardWidthRef.current,
                posRef.current.y / cardHeightRef.current,
              );
            }
          } else if (s?.kind === 'pinch') {
            commitPinch();
          }
          gestureRef.current = null;
          detach();

        } else if (e.touches.length === 1 && s?.kind === 'pinch') {
          // One finger lifted mid-pinch → save pinch, continue as drag
          commitPinch();
          gestureRef.current = makeDrag(e.touches[0]);
        }
      };

      docCancel = () => {
        gestureRef.current = null;
        setIsAdjusting(false);
        detach();
      };

      document.addEventListener('touchmove',   docMove,   { passive: false });
      document.addEventListener('touchend',    docEnd);
      document.addEventListener('touchcancel', docCancel);
    };

    // ── touchstart on the sticker ──────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      // Don't handle if the touch started on the delete button
      if ((e.target as HTMLElement).closest('button')) return;
      // Reject if another sticker already owns the gesture
      if (activeTouchEl !== null && activeTouchEl !== el) return;

      e.stopPropagation();
      e.preventDefault();   // prevents iOS page-zoom during pinch
      activeTouchEl = el;   // acquire the gesture lock

      if (e.touches.length === 1) {
        gestureRef.current = makeDrag(e.touches[0]);
      } else if (e.touches.length >= 2) {
        gestureRef.current = makePinch(e.touches[0], e.touches[1]);
      }

      attach();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      detach();
    };
  }, []); // stable — all mutable values are read via refs

  // ── MOUSE: drag via pointer capture ──────────────────────────────
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
    setPos({
      x: Math.max(0, Math.min(cardWidth  - stickerWRef.current, s.initPos.x + e.clientX - s.startX)),
      y: Math.max(0, Math.min(cardHeight - stickerHRef.current, s.initPos.y + e.clientY - s.startY)),
    });
  }, [cardWidth, cardHeight]);

  const onMousePointerUp = useCallback(() => {
    if (!mouseDragRef.current) return;
    mouseDragRef.current = null;
    onMove(sticker.id, posRef.current.x / cardWidth, posRef.current.y / cardHeight);
  }, [cardWidth, cardHeight, onMove, sticker.id]);

  // Route pointer events to mouse handlers only; touch is handled natively above
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') onMousePointerDown(e);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') onMousePointerMove(e);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') onMousePointerUp();
  };

  // ── DESKTOP handles: rotate ───────────────────────────────────────
  const startRotate = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const rect      = innerRef.current!.getBoundingClientRect();
    const cx        = rect.left + rect.width  / 2;
    const cy        = rect.top  + rect.height / 2;
    const initAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const initRot   = rotationRef.current;

    const onMove = (me: PointerEvent) =>
      setRotation(initRot + Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI - initAngle);

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

  // ── DESKTOP handles: resize ───────────────────────────────────────
  type ResizeCorner = 'br' | 'bl' | 'tl';

  const startResize = useCallback((corner: ResizeCorner) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const startX = e.clientX, startY = e.clientY;
    const initW  = stickerWRef.current, initH = stickerHRef.current;
    const initPos = { ...posRef.current };
    const aspect  = initH / initW;
    const θ = rotationRef.current * Math.PI / 180;
    const cosθ = Math.cos(θ), sinθ = Math.sin(θ);

    const cx  = initPos.x + initW / 2, cy  = initPos.y + initH / 2;
    const aLX = corner === 'br' ? -initW / 2 : +initW / 2;
    const aLY = corner === 'tl' ? +initH / 2 : -initH / 2;
    const aSX = cx + aLX * cosθ - aLY * sinθ;
    const aSY = cy + aLX * sinθ + aLY * cosθ;

    const compute = (cx2: number, cy2: number) => {
      const dx = cx2 - startX, dy = cy2 - startY;
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

  // ── Peel padding calc ──────────────────────────────────────────────
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
        <div className={`${styles.resizeHandle} ${styles.resizeHandleBottomRight}`} onPointerDown={startResize('br')} />
        <div className={`${styles.resizeHandle} ${styles.resizeHandleBottomLeft}`}  onPointerDown={startResize('bl')} />
        <div className={`${styles.resizeHandle} ${styles.resizeHandleUpperLeft}`}   onPointerDown={startResize('tl')} />

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
