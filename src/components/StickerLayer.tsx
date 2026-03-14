import { useEffect, useRef, useState } from 'react';
import styles from './StickerLayer.module.css';
import Draggable from 'react-draggable';
import type { PlacedSticker } from '../storage';

interface PlacedStickerItemProps {
  sticker:    PlacedSticker;
  cardWidth:  number;
  cardHeight: number;
  onMove:     (id: string, xFrac: number, yFrac: number) => void;
  onDelete:   (id: string) => void;
  onUpdate:   (id: string, patch: Partial<PlacedSticker>) => void;
}

function PlacedStickerItem({ sticker, cardWidth, cardHeight, onMove, onDelete, onUpdate }: PlacedStickerItemProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const [rotation,    setRotation]    = useState(sticker.rotation ?? 0);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const [pos,  setPos]  = useState({ x: sticker.x * cardWidth, y: sticker.y * cardHeight });
  const [size, setSize] = useState(sticker.width * cardWidth);

  useEffect(() => {
    if (cardWidth > 0 && cardHeight > 0) {
      setPos({ x: sticker.x * cardWidth, y: sticker.y * cardHeight });
      setSize(sticker.width * cardWidth);
    }
  }, [cardWidth, cardHeight, sticker.x, sticker.y, sticker.width]);

  // ── Rotate ────────────────────────────────────────────
  const startRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const rect      = innerRef.current!.getBoundingClientRect();
    const cx        = rect.left + rect.width  / 2;
    const cy        = rect.top  + rect.height / 2;
    const initAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const initRot   = rotation;

    const onMouseMove = (me: MouseEvent) => {
      const angle = Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI;
      setRotation(initRot + (angle - initAngle));
    };

    const onMouseUp = (me: MouseEvent) => {
      const angle    = Math.atan2(me.clientY - cy, me.clientX - cx) * 180 / Math.PI;
      const finalRot = initRot + (angle - initAngle);
      setRotation(finalRot);
      onUpdate(sticker.id, { rotation: finalRot });
      setIsAdjusting(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  };

  // ── Resize ────────────────────────────────────────────
  const startResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAdjusting(true);

    const startX   = e.clientX;
    const startY   = e.clientY;
    const initSize = size;

    const onMouseMove = (me: MouseEvent) => {
      const delta   = (me.clientX - startX + me.clientY - startY) / 2;
      const newSize = Math.max(32, Math.min(cardWidth * 0.8, initSize + delta));
      setSize(newSize);
    };

    const onMouseUp = (me: MouseEvent) => {
      const delta     = (me.clientX - startX + me.clientY - startY) / 2;
      const finalSize = Math.max(32, Math.min(cardWidth * 0.8, initSize + delta));
      setSize(finalSize);
      const fracSize  = finalSize / cardWidth;
      onUpdate(sticker.id, { width: fracSize, height: fracSize });
      setIsAdjusting(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  };

  // Unique filter IDs so multiple stickers don't share the same SVG filter
  const backFilterId   = `stickerBack-${sticker.id}`;
  const shadowFilterId = `stickerShadow-${sticker.id}`;

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
        className={`${styles.stickerWrap}${isAdjusting ? ` ${styles.isActive}` : ''}`}
      >
        <div
          ref={innerRef}
          className={styles.sticker}
          style={{ transform: `rotate(${rotation}deg)`, width: size, height: size }}
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
                <feFlood floodColor="rgb(179,179,179)" result="flood" />
                <feComposite operator="in" in="flood" in2="shape" />
              </filter>
              <filter id={shadowFilterId}>
                <feDropShadow dx="1" dy="3" stdDeviation="3"
                  floodColor="black" floodOpacity="0.45" />
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
              style={{ filter: `url(#${shadowFilterId})` }}
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
            className={styles.resizeHandle}
            onMouseDown={startResize}
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
  stickers:   PlacedSticker[];
  cardWidth:  number;
  cardHeight: number;
  onMove:     (id: string, xFrac: number, yFrac: number) => void;
  onDelete:   (id: string) => void;
  onUpdate:   (id: string, patch: Partial<PlacedSticker>) => void;
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
