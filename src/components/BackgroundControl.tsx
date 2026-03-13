import { useState, useEffect, useRef } from 'react';
import { saveSetting, loadSetting, saveStickerItem, loadAllStickers, deleteStickerItem } from '../storage';
import type { StickerItem } from '../storage';
import styles from './BackgroundControl.module.css';

export default function BackgroundControl() {
  const [open,         setOpen]         = useState(false);
  const [bgColor,      setBgColor]      = useState('#1a1612');
  const [stickerPack,  setStickerPack]  = useState<StickerItem[]>([]);
  const popoverRef     = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);

  // restore saved background on mount
  useEffect(() => {
    (async () => {
      const type  = await loadSetting('bg-type');
      const value = await loadSetting('bg-value');
      if (type === 'color' && value) {
        document.body.style.backgroundImage = 'none';
        document.body.style.backgroundColor = value;
        setBgColor(value);
      } else if (type === 'image' && value) {
        document.body.style.background = `url(${value}) center/cover no-repeat fixed`;
      }
    })();
  }, []);

  // load sticker pack from IndexedDB on mount
  useEffect(() => {
    loadAllStickers().then(setStickerPack);
  }, []);

  // close popover on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const applyColor = async (color: string) => {
    setBgColor(color);
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = color;
    await saveSetting('bg-type',  'color');
    await saveSetting('bg-value', color);
  };

  const applyImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async e => {
      const url = e.target!.result as string;
      document.body.style.background = `url(${url}) center/cover no-repeat fixed`;
      await saveSetting('bg-type',  'image');
      await saveSetting('bg-value', url);
    };
    reader.readAsDataURL(file);
  };

  const handleStickerUpload = (file: File) => {
    if (!file.type.match(/image\/(png|jpeg)/)) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const dataURL = e.target!.result as string;
      const id = crypto.randomUUID();
      const item: StickerItem = { id, dataURL };
      await saveStickerItem(item);
      setStickerPack(prev => [...prev, item]);
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSticker = async (id: string) => {
    await deleteStickerItem(id);
    setStickerPack(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className={styles.bgControl} ref={popoverRef}>
      <button
        className={styles.bgBtn}
        title="Change background"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        🎨
      </button>

      {open && (
        <div className={styles.bgPopover}>
          {/* ── Background section ── */}
          <p className={styles.bgLabel}>Background</p>
          <label className={styles.bgOption}>
            <span>Color</span>
            <input
              type="color"
              value={bgColor}
              onChange={e => applyColor(e.target.value)}
            />
          </label>
          <button
            className={styles.bgOptionBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && applyImageFile(e.target.files[0])}
          />

          {/* ── Sticker Pack section ── */}
          <div className={styles.divider} />
          <p className={styles.bgLabel}>Sticker Pack</p>

          {stickerPack.length > 0 && (
            <div className={styles.stickerPackGrid}>
              {stickerPack.map(sticker => (
                <div key={sticker.id} className={styles.stickerThumbWrap}>
                  <img
                    className={styles.stickerThumb}
                    src={sticker.dataURL}
                    alt=""
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData(
                        'sticker-data',
                        JSON.stringify({ id: sticker.id, dataURL: sticker.dataURL })
                      );
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    title="Drag to place on calendar"
                  />
                  <button
                    className={styles.stickerThumbDelete}
                    onClick={() => handleDeleteSticker(sticker.id)}
                    title="Remove from pack"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {stickerPack.length === 0 && (
            <p className={styles.stickerPackEmpty}>No stickers yet</p>
          )}

          <button
            className={styles.bgOptionBtn}
            onClick={() => stickerInputRef.current?.click()}
          >
            + Add sticker
          </button>
          <input
            ref={stickerInputRef}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files?.[0]) {
                handleStickerUpload(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
