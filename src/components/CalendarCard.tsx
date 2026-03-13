import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import styles from './CalendarCard.module.css';
import LeftPanel from './LeftPanel';
import CalendarGrid from './CalendarGrid';
import StickerLayer from './StickerLayer';
import { loadPlacedStickers, savePlacedStickers } from '../storage';
import type { PlacedSticker } from '../storage';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  year: number;
  month: number;
  onPrevYear: () => void;
  onNextYear: () => void;
}

export default function CalendarCard({ year, month, onPrevYear, onNextYear }: Props) {
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [stickerDragOver, setStickerDragOver] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const monthKey = `placed-${year}-${month}`;

  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setCardSize({ width, height });
    });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  // load placed stickers when month/year changes
  useEffect(() => {
    setPlacedStickers([]);
    loadPlacedStickers(monthKey).then(setPlacedStickers);
  }, [monthKey]);

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('sticker-data')) {
      e.preventDefault();
      setStickerDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // only clear if leaving the card entirely
    if (!cardRef.current?.contains(e.relatedTarget as Node)) {
      setStickerDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    setStickerDragOver(false);
    const data = e.dataTransfer.getData('sticker-data');
    if (!data || !cardRef.current) return;
    e.preventDefault();

    const { dataURL } = JSON.parse(data) as { id: string; dataURL: string };
    const rect    = cardRef.current.getBoundingClientRect();
    const pixelX  = e.clientX - rect.left;
    const pixelY  = e.clientY - rect.top;
    const fracSize = 80 / rect.width;

    const newSticker: PlacedSticker = {
      id: crypto.randomUUID(),
      stickerDataURL: dataURL,
      x: (pixelX - 40) / rect.width,
      y: (pixelY - 40) / rect.height,
      width:  fracSize,
      height: fracSize,
      rotation: 0,
    };

    const updated = [...placedStickers, newSticker];
    setPlacedStickers(updated);
    savePlacedStickers(monthKey, updated);
  };

  const handleStickerMove = (id: string, x: number, y: number) => {
    const updated = placedStickers.map(s => s.id === id ? { ...s, x, y } : s);
    setPlacedStickers(updated);
    savePlacedStickers(monthKey, updated);
  };

  const handleStickerDelete = (id: string) => {
    const updated = placedStickers.filter(s => s.id !== id);
    setPlacedStickers(updated);
    savePlacedStickers(monthKey, updated);
  };

  const handleStickerUpdate = (id: string, patch: Partial<PlacedSticker>) => {
    const updated = placedStickers.map(s => s.id === id ? { ...s, ...patch } : s);
    setPlacedStickers(updated);
    savePlacedStickers(monthKey, updated);
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
        cardWidth={cardSize.width}
        cardHeight={cardSize.height}
      />
    </div>
  );
}
