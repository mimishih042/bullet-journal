import { useState, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import { saveSetting, loadSetting, saveStickerItem, loadAllStickers, deleteStickerItem } from '../storage';
import type { StickerItem } from '../storage';
import EditIcon from '../assets/edit.svg'
import styles from './BackgroundControl.module.css';
import StickerPeelPreview from './StickerPeelPreview';

/** Crops a PNG/JPEG dataURL to the smallest rect containing all non-transparent pixels. */
function trimTransparent(dataURL: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const { data } = ctx.getImageData(0, 0, width, height);
      let minX = width, minY = height, maxX = 0, maxY = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Fully transparent — return as-is
      if (minX > maxX || minY > maxY) { resolve(dataURL); return; }

      const trimW = maxX - minX + 1;
      const trimH = maxY - minY + 1;
      const out   = document.createElement('canvas');
      out.width   = trimW;
      out.height  = trimH;
      out.getContext('2d')!.drawImage(canvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);
      resolve(out.toDataURL('image/png'));
    };
    img.src = dataURL;
  });
}

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
      const trimmed = await trimTransparent(dataURL);
      const id = crypto.randomUUID();
      const item: StickerItem = { id, dataURL: trimmed };
      await saveStickerItem(item);
      setStickerPack(prev => [...prev, item]);
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSticker = async (id: string) => {
    await deleteStickerItem(id);
    setStickerPack(prev => prev.filter(s => s.id !== id));
  };

  const [printMode, setPrintMode] = useState<'with-tabs' | 'no-tabs'>('with-tabs');
  const [exporting, setExporting] = useState(false);

  const handleSavePng = async () => {
    const wrapper = document.getElementById('journal-wrapper');
    if (!wrapper) return;
    setExporting(true);
    try {
      const scale = 2;

      // Optionally hide month tabs
      const hideTabs = printMode === 'no-tabs';
      const tabsEl = document.getElementById('month-tabs');
      if (hideTabs && tabsEl) tabsEl.style.display = 'none';

      // Capture the journal wrapper at 2x
      const journalDataUrl = await toPng(wrapper, { pixelRatio: scale, cacheBust: true });

      if (hideTabs && tabsEl) tabsEl.style.display = '';

      // Measure wrapper and add padding so the calendar sits centred in the
      // square with breathing room on all four sides (~15% of calendar width).
      const { width: wW, height: wH } = wrapper.getBoundingClientRect();
      const pad  = wW * 0.15;
      const size = Math.max(wW + pad * 2, wH + pad * 2);

      const canvas = document.createElement('canvas');
      canvas.width  = size * scale;
      canvas.height = size * scale;
      const ctx = canvas.getContext('2d')!;

      // ── Draw background (color or image) from stored settings ──────────
      const bgType  = await loadSetting('bg-type');
      const bgValue = await loadSetting('bg-value');

      if (bgType === 'image' && bgValue) {
        await new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => {
            // Replicate "center / cover" behaviour
            const imgAspect = img.naturalWidth / img.naturalHeight;
            let drawW, drawH;
            if (imgAspect > 1) {          // wider than square
              drawH = canvas.height;
              drawW = drawH * imgAspect;
            } else {                      // taller than square
              drawW = canvas.width;
              drawH = drawW / imgAspect;
            }
            ctx.drawImage(img,
              (canvas.width  - drawW) / 2,
              (canvas.height - drawH) / 2,
              drawW, drawH,
            );
            resolve();
          };
          img.onerror = () => resolve();
          img.src = bgValue;
        });
      } else {
        ctx.fillStyle = bgValue || '#1a1612';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // ── Draw journal wrapper centred on the square canvas ──────────────
      await new Promise<void>(resolve => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img,
            ((size - wW) / 2) * scale,
            ((size - wH) / 2) * scale,
            wW * scale,
            wH * scale,
          );
          resolve();
        };
        img.src = journalDataUrl;
      });

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'journal.png';
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* Toggle button — always fixed top-right */}
      <button
        className={`${styles.bgBtn} ${open ? styles.bgBtnActive : ''}`}
        title={open ? 'Close panel' : 'Change background & stickers'}
        onClick={onToggle}
        data-print-hidden
      >
        <img src={EditIcon} alt="" />
      </button>

      {/* In-flow panel wrapper — animates width to push journal left */}
      <div className={`${styles.panelOuter} ${open ? styles.panelOpen : ''}`} data-print-hidden>
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

                      // Use a plain img as drag ghost so the preview shows only
                      // the sticker, not the surrounding peel container.
                      const ghost = document.createElement('img');
                      ghost.src = sticker.dataURL;
                      ghost.width = 80;
                      ghost.height = 80;
                      ghost.style.cssText =
                        'position:fixed;top:-200px;left:-200px;object-fit:contain;pointer-events:none;';
                      document.body.appendChild(ghost);
                      e.dataTransfer.setDragImage(ghost, 40, 40);
                      requestAnimationFrame(() => document.body.removeChild(ghost));
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

            <br/>

            {/* ── Print / Export ── */}
            <p className={styles.sectionLabel}>Export</p>
            <button
              className={styles.actionBtn}
              onClick={handleSavePng}
              disabled={exporting}
            >
              {exporting ? 'Saving…' : 'Save as PNG'}
            </button>

          </div>
        </div>
      </div>

    </>
  );
}
