import { useState, useEffect, useRef } from 'react';
import { saveSetting, loadSetting, saveStickerItem, loadAllStickers, deleteStickerItem } from '../storage';
import type { StickerItem } from '../storage';
import EditIcon from '../assets/edit.svg'
import styles from './BackgroundControl.module.css';
import StickerPeelPreview from './StickerPeelPreview';

interface Props {
  open: boolean;
  onToggle: () => void;
}

export default function BackgroundControl({ open, onToggle }: Props) {
  const [bgColor, setBgColor] = useState('#1a1612');
  const [stickerPack, setStickerPack] = useState<StickerItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const type = await loadSetting('bg-type');
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

  useEffect(() => {
    loadAllStickers().then(setStickerPack);
  }, []);

  const applyColor = async (color: string) => {
    setBgColor(color);
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = color;
    await saveSetting('bg-type', 'color');
    await saveSetting('bg-value', color);
  };

  const applyImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async e => {
      const url = e.target!.result as string;
      document.body.style.background = `url(${url}) center/cover no-repeat fixed`;
      await saveSetting('bg-type', 'image');
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
    <>
      {/* Toggle button — always fixed top-right */}
      <button
        className={`${styles.bgBtn} ${open ? styles.bgBtnActive : ''}`}
        title={open ? 'Close panel' : 'Change background & stickers'}
        onClick={onToggle}
      >
        <img src={EditIcon} alt="" />
      </button>

      {/* In-flow panel wrapper — animates width to push journal left */}
      <div className={`${styles.panelOuter} ${open ? styles.panelOpen : ''}`}>
        {/* Side panel */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Customization</span>
            <button
              className={styles.panelClose}
              title="Close"
              onClick={onToggle}
            >
              ×
            </button>
          </div>

          <div className={styles.panelBody}>
            {/* ── Background ── */}
            <p className={styles.sectionLabel}>Background</p>
            <label className={styles.bgOption}>
              <span>Color</span>
              <input
                type="color"
                value={bgColor}
                onChange={e => applyColor(e.target.value)}
              />
            </label>
            <button
              className={styles.actionBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload background image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && applyImageFile(e.target.files[0])}
            />

            <br/>

            {/* ── Sticker Pack ── */}
            <p className={styles.sectionLabel}>Sticker Pack</p>

            {stickerPack.length > 0 && (
              <div className={styles.stickerGrid}>
                {stickerPack.map(sticker => (
                  <div
                    key={sticker.id}
                    className={styles.stickerThumbWrap}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData(
                        'sticker-data',
                        JSON.stringify({ id: sticker.id, dataURL: sticker.dataURL })
                      );
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    title="Drag to place on calendar"
                  >
                    <StickerPeelPreview src={sticker.dataURL} filterId={sticker.id} />
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
              <p className={styles.stickerEmpty}>No stickers yet</p>
            )}

            <button
              className={styles.actionBtn}
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
        </div>
      </div>

    </>
  );
}
