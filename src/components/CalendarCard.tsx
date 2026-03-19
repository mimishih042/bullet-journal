import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import styles from './CalendarCard.module.css';
import LeftPanel from './LeftPanel';
import CalendarGrid from './CalendarGrid';
import StickerLayer from './StickerLayer';
import { loadPlacedStickers, savePlacedStickers } from '../storage';
import type { PlacedSticker } from '../storage';
import { useHistoryContext } from '../context/HistoryContext';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  year: number;
  month: number;
  onPrevYear: () => void;
  onNextYear: () => void;
  stickersLocked: boolean;
}

export default function CalendarCard({ year, month, onPrevYear, onNextYear, stickersLocked }: Props) {
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [stickerDragOver, setStickerDragOver] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const monthKey = `placed-${year}-${month}`;
  const placedStickersRef = useRef(placedStickers);
  const history = useHistoryContext();

  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setCardSize({ width, height });
    });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  // keep ref in sync so the touch-drop handler always sees fresh state
  useEffect(() => { placedStickersRef.current = placedStickers; }, [placedStickers]);

  // load placed stickers when month/year changes
  useEffect(() => {
    setPlacedStickers([]);
    loadPlacedStickers(monthKey).then(setPlacedStickers);
  }, [monthKey]);

  // touch drag-and-drop from the sticker panel (iOS Safari doesn't support HTML5 DnD)
  useEffect(() => {
    const handleTouchDrop = (e: Event) => {
      const { dataURL, clientX, clientY } = (e as CustomEvent<{ dataURL: string; clientX: number; clientY: number }>).detail;
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;

      const pixelX = clientX - rect.left;
      const pixelY = clientY - rect.top;

      const img = new Image();
      img.onload = () => {
        const fracW    = 80 / rect.width;
        const fracH    = fracW * (img.naturalHeight / img.naturalWidth);
        const halfPixH = (fracH * rect.width) / 2;

        const newSticker: PlacedSticker = {
          id: crypto.randomUUID(),
          stickerDataURL: dataURL,
          x: (pixelX - 40) / rect.width,
          y: (pixelY - halfPixH) / rect.height,
          width: fracW,
          height: fracH,
          rotation: 0,
          zIndex: nextZIndex(placedStickersRef.current),
        };

        const updated = [...placedStickersRef.current, newSticker];
        setPlacedStickers(updated);
        savePlacedStickers(monthKey, updated);

        const addedId = newSticker.id;
        const key = monthKey;
        history.push({
          undo: () => setPlacedStickers(curr => {
            const u = curr.filter(s => s.id !== addedId);
            savePlacedStickers(key, u);
            return u;
          }),
          redo: () => setPlacedStickers(curr => {
            const u = [...curr, newSticker];
            savePlacedStickers(key, u);
            return u;
          }),
        });
      };
      img.src = dataURL;
    };

    document.addEventListener('sticker-touch-drop', handleTouchDrop);
    return () => document.removeEventListener('sticker-touch-drop', handleTouchDrop);
  }, [monthKey]); // history.push is stable (useCallback [])

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('sticker-data')) {
      e.preventDefault();
      setStickerDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!cardRef.current?.contains(e.relatedTarget as Node)) {
      setStickerDragOver(false);
    }
  };

  const nextZIndex = (stickers: PlacedSticker[]) =>
    stickers.length === 0 ? 1 : Math.max(...stickers.map(s => s.zIndex ?? 0)) + 1;

  const handleDrop = (e: React.DragEvent) => {
    setStickerDragOver(false);
    const data = e.dataTransfer.getData('sticker-data');
    if (!data || !cardRef.current) return;
    e.preventDefault();

    const { dataURL } = JSON.parse(data) as { id: string; dataURL: string };
    const rect   = cardRef.current.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    const img = new Image();
    img.onload = () => {
      const fracW    = 80 / rect.width;
      const fracH    = fracW * (img.naturalHeight / img.naturalWidth);
      const halfPixH = (fracH * rect.width) / 2;

      // Capture prev state inside onload via ref (avoids stale closure on async boundary)
      const newSticker: PlacedSticker = {
        id: crypto.randomUUID(),
        stickerDataURL: dataURL,
        x: (pixelX - 40)       / rect.width,
        y: (pixelY - halfPixH) / rect.height,
        width:  fracW,
        height: fracH,
        rotation: 0,
        zIndex: nextZIndex(placedStickersRef.current),
      };

      const updated = [...placedStickersRef.current, newSticker];
      setPlacedStickers(updated);
      savePlacedStickers(monthKey, updated);

      const addedId = newSticker.id;
      const key = monthKey;
      history.push({
        undo: () => setPlacedStickers(curr => {
          const u = curr.filter(s => s.id !== addedId);
          savePlacedStickers(key, u);
          return u;
        }),
        redo: () => setPlacedStickers(curr => {
          const u = [...curr, newSticker];
          savePlacedStickers(key, u);
          return u;
        }),
      });
    };
    img.src = dataURL;
  };

  const handleStickerMove = (id: string, x: number, y: number) => {
    const prev = placedStickers.find(s => s.id === id);
    const prevX = prev?.x ?? x, prevY = prev?.y ?? y;
    const key = monthKey;
    const updated = placedStickers.map(s => s.id === id ? { ...s, x, y } : s);
    setPlacedStickers(updated);
    savePlacedStickers(monthKey, updated);
    history.push({
      undo: () => setPlacedStickers(curr => {
        const u = curr.map(s => s.id === id ? { ...s, x: prevX, y: prevY } : s);
        savePlacedStickers(key, u);
        return u;
      }),
      redo: () => setPlacedStickers(curr => {
        const u = curr.map(s => s.id === id ? { ...s, x, y } : s);
        savePlacedStickers(key, u);
        return u;
      }),
    });
  };

  const handleStickerDelete = (id: string) => {
    const deleted = placedStickers.find(s => s.id === id);
    if (!deleted) return;
    const key = monthKey;
    const updated = placedStickers.filter(s => s.id !== id);
    setPlacedStickers(updated);
    savePlacedStickers(monthKey, updated);
    history.push({
      undo: () => setPlacedStickers(curr => {
        const u = [...curr, deleted];
        savePlacedStickers(key, u);
        return u;
      }),
      redo: () => setPlacedStickers(curr => {
        const u = curr.filter(s => s.id !== id);
        savePlacedStickers(key, u);
        return u;
      }),
    });
  };

  const handleStickerUpdate = (id: string, patch: Partial<PlacedSticker>) => {
    const prev = placedStickers.find(s => s.id === id);
    if (!prev) return;
    const prevPatch = Object.fromEntries(
      Object.keys(patch).map(k => [k, (prev as unknown as Record<string, unknown>)[k]])
    ) as Partial<PlacedSticker>;
    const key = monthKey;
    const updated = placedStickers.map(s => s.id === id ? { ...s, ...patch } : s);
    setPlacedStickers(updated);
    savePlacedStickers(monthKey, updated);
    history.push({
      undo: () => setPlacedStickers(curr => {
        const u = curr.map(s => s.id === id ? { ...s, ...prevPatch } : s);
        savePlacedStickers(key, u);
        return u;
      }),
      redo: () => setPlacedStickers(curr => {
        const u = curr.map(s => s.id === id ? { ...s, ...patch } : s);
        savePlacedStickers(key, u);
        return u;
      }),
    });
  };

  const handleBringToFront = (id: string) => {
    setPlacedStickers(prev => {
      const top = nextZIndex(prev);
      const updated = prev.map(s => s.id === id ? { ...s, zIndex: top } : s);
      savePlacedStickers(monthKey, updated);
      return updated;
    });
    // Intentionally not recorded in history — z-index reordering is a UX convenience,
    // not a meaningful state change the user would want to undo.
  };

  return (
    <div
      className={`${styles.calendarCard}${stickerDragOver ? ` ${styles.stickerDragOver}` : ''}`}
      ref={cardRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <LeftPanel
        year={year}
        month={month}
        onPrevYear={onPrevYear}
        onNextYear={onNextYear}
      />

      <div className={styles.rightPanel}>
        <div className={styles.dayHeaders}>
          {DAY_LABELS.map(d => (
            <div key={d} className={styles.dayHeaderCell}>{d}</div>
          ))}
        </div>
        <CalendarGrid year={year} month={month} />
      </div>

      <StickerLayer
        stickers={placedStickers}
        onMove={handleStickerMove}
        onDelete={handleStickerDelete}
        onUpdate={handleStickerUpdate}
        onBringToFront={handleBringToFront}
        cardWidth={cardSize.width}
        cardHeight={cardSize.height}
        locked={stickersLocked}
      />
    </div>
  );
}
