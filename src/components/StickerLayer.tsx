import { useEffect, useRef, useState } from 'react';
import styles from './StickerLayer.module.css';
import Draggable from 'react-draggable';
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
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const [rotation, setRotation] = useState(sticker.rotation ?? 0);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const [pos, setPos] = useState({ x: sticker.x * cardWidth, y: sticker.y * cardHeight });
  const [stickerW, setStickerW] = useState(sticker.width * cardWidth);
  const [stickerH, setStickerH] = useState(sticker.height * cardWidth);

  const hoverTimer = useRef<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    if (cardWidth > 0 && cardHeight > 0) {
      setPos({ x: sticker.x * cardWidth, y: sticker.y * cardHeight });
      setStickerW(sticker.width * cardWidth);
      setStickerH(sticker.height * cardWidth);
    }
  }, [cardWidth, cardHeight, sticker.x, sticker.y, sticker.width, sticker.height]);

  // ── Rotate ────────────────────────────────────────────
  const startRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const rect = innerRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const initAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const initRot = rotation;

    const onMouseMove = (me: MouseEvent) => {
      const angle = Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI;
      setRotation(initRot + (angle - initAngle));
    };

    const onMouseUp = (me: MouseEvent) => {
      const angle = Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI;
      const finalRot = initRot + (angle - initAngle);
      setRotation(finalRot);
      onUpdate(sticker.id, { rotation: finalRot });
      setIsAdjusting(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // ── Resize ────────────────────────────────────────────
  //
  // Each handle is identified by which corner it sits on.  The opposite corner
  // is the "anchor" that must stay fixed in screen space while resizing.
  //
  // To support sticker rotation we work in two coordinate systems:
  //   • screen space – raw mouse deltas
  //   • local space  – sticker's own axes, rotated by `rotation` degrees
  //
  // Steps per drag tick:
  //   1. Project screen delta onto local axes → (dxL, dyL)
  //   2. Compute size delta with the correct sign for this handle
  //   3. Derive new (w, h) at the locked aspect ratio
  //   4. Recompute `pos` so the anchor corner stays at its original screen position
  //
  type ResizeCorner = 'br' | 'bl' | 'tl';

  const startResize = (corner: ResizeCorner) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const startX  = e.clientX;
    const startY  = e.clientY;
    const initW   = stickerW;
    const initH   = stickerH;
    const initPos = { ...pos };
    const aspect  = initH / initW;
    const θ       = rotation * Math.PI / 180;
    const cosθ    = Math.cos(θ);
    const sinθ    = Math.sin(θ);

    // Center of the sticker in screen space
    const cx = initPos.x + initW / 2;
    const cy = initPos.y + initH / 2;

    // Anchor corner: local offset from center (the corner that stays fixed)
    //   br → top-left  (−W/2, −H/2)
    //   bl → top-right (+W/2, −H/2)
    //   tl → bot-right (+W/2, +H/2)
    const aLX = corner === 'br' ? -initW / 2 : +initW / 2;
    const aLY = corner === 'tl' ? +initH / 2 : -initH / 2;

    // Anchor screen position — fixed for the entire drag
    const aSX = cx + aLX * cosθ - aLY * sinθ;
    const aSY = cy + aLX * sinθ + aLY * cosθ;

    const compute = (me: MouseEvent) => {
      const dx  = me.clientX - startX;
      const dy  = me.clientY - startY;
      // Project screen delta onto sticker-local axes
      const dxL =  dx * cosθ + dy * sinθ;
      const dyL = -dx * sinθ + dy * cosθ;
      // Sign convention: positive delta = grow
      const delta =
        corner === 'br' ? ( dxL + dyL) / 2 :
        corner === 'bl' ? (-dxL + dyL) / 2 :
                          (-dxL - dyL) / 2;   // tl
      const newW = Math.max(32, Math.min(cardWidth * 0.8, initW + delta));
      const newH = newW * aspect;
      // New anchor local offset (same corner, scaled to new size)
      const naLX = corner === 'br' ? -newW / 2 : +newW / 2;
      const naLY = corner === 'tl' ? +newH / 2 : -newH / 2;
      // Solve: aSX = newCx + R(naL).x  →  newCx = aSX − R(naL).x
      const newCx  = aSX - (naLX * cosθ - naLY * sinθ);
      const newCy  = aSY - (naLX * sinθ + naLY * cosθ);
      const newPos = { x: newCx - newW / 2, y: newCy - newH / 2 };
      return { newW, newH, newPos };
    };

    const onMouseMove = (me: MouseEvent) => {
      const { newW, newH, newPos } = compute(me);
      setStickerW(newW);
      setStickerH(newH);
      setPos(newPos);
    };

    const onMouseUp = (me: MouseEvent) => {
      const { newW, newH, newPos } = compute(me);
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
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  };

  // delay hovering effect to prevent colliding with other element on the journal
  const handleMouseEnter = () => {
    hoverTimer.current = window.setTimeout(() => {
      setIsHovering(true);
    }, 70); // 60–80ms works well
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setIsHovering(false);
  };

  // How far the counter-rotated image corners extend beyond the sticker bounds.
  // Needs to grow with the long dimension for non-square (e.g. wide banner) stickers.
  const PEEL_SIN = Math.sin(67 * Math.PI / 180); // 0.9205
  const PEEL_COS = Math.cos(67 * Math.PI / 180); // 0.3907
  const peelP = Math.max(
    10,
    Math.ceil((PEEL_SIN * Math.max(stickerW, stickerH) - PEEL_COS * Math.min(stickerW, stickerH)) / 2) + 4,
  );

  // Unique filter IDs so multiple stickers don't share the same SVG filter
  const backFilterId = `stickerBack-${sticker.id}`;

  return (
    <Draggable
      nodeRef={outerRef as React.RefObject<HTMLElement>}
      position={pos}
      onDrag={(_, data) => setPos({ x: data.x, y: data.y })}
      onStop={(_, data) => {
        setPos({ x: data.x, y: data.y });
        if (cardWidth > 0 && cardHeight > 0)
          onMove(sticker.id, data.x / cardWidth, data.y / cardHeight);
      }}
      bounds="parent"
      disabled={isAdjusting}
    >
      <div
        ref={outerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`${styles.stickerWrap}
          ${isAdjusting ? styles.isActive : ''}
          ${isHovering ? styles.isHovering : ''}
        `}
      >
        <div
          ref={innerRef}
          className={styles.sticker}
          style={{ transform: `rotate(${rotation}deg)`, width: stickerW, height: stickerH, '--peel-p': `${peelP}px` } as React.CSSProperties}
        >
          {/*
            SVG filter definitions — scoped per sticker via unique IDs.
            expandAndFill: fills the PNG's alpha shape with a flat gray
                           → creates the "adhesive backing" appearance on the flap.
            dropShadow:    shape-aware shadow on the front layer.
          */}
          <svg width="0" height="0" className={styles.filterSvg}>
            <defs>
              <filter id={backFilterId}>
                <feOffset dx="0" dy="0" in="SourceAlpha" result="shape" />
                <feFlood floodColor="rgb(221 214 200)" result="flood" />
                <feComposite operator="in" in="flood" in2="shape" />
              </filter>
            </defs>
          </svg>

          {/*
            Peel container — rotated by --peel-angle (67°).
            Because the clip-path on stickerMain uses percentage coords in the
            container's LOCAL (rotated) space, the horizontal clip line appears
            as a DIAGONAL line on screen, creating the angled peel effect.
            Children counter-rotate by -67° so the sticker image stays upright.
          */}
          <div className={styles.peelContainer}>

            {/* Front layer — clips upward to reveal the peel on hover */}
            <div
              className={styles.stickerMain}
            >
              <div className={styles.stickerMainInner}>
                <img
                  src={sticker.stickerDataURL}
                  draggable={false}
                  alt=""
                  className={styles.stickerImg}
                />
              </div>
            </div>

            {/*
              Back flap — same PNG, scaleY(-1) flipped + gray fill filter.
              Positioned above stickerMain, slides into view on hover.
              The gray fill makes it look like the adhesive backing paper.
            */}
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

          {/* Handles — siblings of peelContainer, unaffected by its rotation */}
          <div
            className={styles.rotateHandle}
            onMouseDown={startRotate}
            title="Rotate"
          >
            ↻
          </div>

          <div
            className={`${styles.resizeHandle} ${styles.resizeHandleBottomRight}`}
            onMouseDown={startResize('br')}
            title="Resize"
          />

          <div
            className={`${styles.resizeHandle} ${styles.resizeHandleBottomLeft}`}
            onMouseDown={startResize('bl')}
            title="Resize"
          />

          <div
            className={`${styles.resizeHandle} ${styles.resizeHandleUpperLeft}`}
            onMouseDown={startResize('tl')}
            title="Resize"
          />

          <button
            className={styles.deleteBtn}
            onClick={e => { e.stopPropagation(); onDelete(sticker.id); }}
            title="Remove sticker"
          >
            ×
          </button>
        </div>
      </div>
    </Draggable>
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
