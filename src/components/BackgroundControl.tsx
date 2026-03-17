import { useState, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import { saveSetting, loadSetting, saveStickerItem, loadAllStickers, deleteStickerItem } from '../storage';
import type { StickerItem } from '../storage';
import EditIcon from '../assets/edit.svg'
import styles from './BackgroundControl.module.css';
import StickerPeelPreview from './StickerPeelPreview';
import ExtractModal from './ExtractModal';
import { extractStickersFromSheet } from '../utils/extractStickers';

/**
 * Fetches the project font from Google Fonts and injects it as a base64
 * @font-face style element so html-to-image can embed it on iOS Safari,
 * where cross-origin font fetching from a canvas is blocked.
 * Returns the injected <style> element so the caller can remove it later.
 */
let _cachedFontCSS: string | null = null;

async function inlineFont(): Promise<HTMLStyleElement | null> {
  try {
    if (!_cachedFontCSS) {
      const cssRes = await fetch(
        'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap'
      );
      if (!cssRes.ok) return null;
      let css = await cssRes.text();

      // Replace every url(...) with a base64 data URI
      const urlMatches = [...css.matchAll(/url\(([^)]+)\)/g)];
      for (const match of urlMatches) {
        const fontUrl = match[1].replace(/['"]/g, '');
        try {
          const fontRes = await fetch(fontUrl);
          const blob = await fontRes.blob();
          const dataUri = await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          css = css.replace(match[0], `url(${dataUri})`);
        } catch { /* skip unresolvable URLs */ }
      }
      _cachedFontCSS = css;
    }

    const style = document.createElement('style');
    style.setAttribute('data-font-embed', '');
    style.textContent = _cachedFontCSS;
    document.head.appendChild(style);
    return style;
  } catch {
    return null;
  }
}

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
  year: number;
  month: number;
}

export default function BackgroundControl({ open, onToggle, year, month }: Props) {
  const [bgColor, setBgColor] = useState('#ece7df');
  const [stickerPack, setStickerPack] = useState<StickerItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);

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
      const item: StickerItem = { id, dataURL: trimmed, order: stickerPack.length };
      await saveStickerItem(item);
      setStickerPack(prev => [...prev, item]);
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSticker = async (id: string) => {
    await deleteStickerItem(id);
    setStickerPack(prev => prev.filter(s => s.id !== id));
  };

  const toggleFavorite = async (id: string) => {
    const updated = stickerPack.map(s =>
      s.id === id ? { ...s, isFavorite: !s.isFavorite } : s
    );
    setStickerPack(updated);
    const item = updated.find(s => s.id === id)!;
    await saveStickerItem(item);
  };

  const favorites = stickerPack.filter(s => s.isFavorite);

  // ── Edit / reorder mode ───────────────────────────────────────────────────
  const [isEditingStickers, setIsEditingStickers] = useState(false);
  const [draggingId,        setDraggingId]        = useState<string | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const handleReorderDragStart = (e: React.DragEvent, index: number, id: string) => {
    dragIndexRef.current = index;
    setDraggingId(id);
    // Invisible drag image so the ghost doesn't fight with the live grid
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;top:-200px;left:-200px;width:1px;height:1px;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  const handleReorderDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setStickerPack(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(index, 0, item);
      return next;
    });
    dragIndexRef.current = index;
  };

  const handleReorderDragEnd = () => {
    dragIndexRef.current = null;
    setDraggingId(null);
  };

  const handleEditDone = async () => {
    setIsEditingStickers(false);
    setDraggingId(null);
    // Persist new order: assign sequential order values matching the array index
    const updated = stickerPack.map((s, i) => ({ ...s, order: i }));
    setStickerPack(updated);
    for (const item of updated) await saveStickerItem(item);
  };

  const handleSheetUpload = async (file: File) => {
    setExtracting(true);
    // Yield to let React render the loading state before blocking canvas work
    await new Promise(r => setTimeout(r, 0));
    try {
      const results = await extractStickersFromSheet(file);
      let orderBase = stickerPack.length;
      for (const dataURL of results) {
        const id = crypto.randomUUID();
        const item: StickerItem = { id, dataURL, order: orderBase++ };
        await saveStickerItem(item);
        setStickerPack(prev => [...prev, item]);
      }
    } finally {
      setExtracting(false);
    }
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

      // Temporarily suppress box-shadows for a clean export
      const noShadowStyle = document.createElement('style');
      noShadowStyle.textContent = [
        '#journal-wrapper * { box-shadow: none !important; }',
        '#journal-wrapper [data-today]::after { display: none !important; }',
        '#journal-wrapper [data-today] span { color: var(--color-ink-tertiary) !important; font-weight: normal !important; }',
      ].join('\n');
      document.head.appendChild(noShadowStyle);

      // Embed font as base64 so iOS Safari canvas can use it
      const fontStyle = await inlineFont();

      // Wait for every img in the journal to be fully decoded.
      // On iOS/iPadOS the browser may not have rasterised images yet when
      // html-to-image takes its DOM snapshot, causing stickers to disappear.
      await Promise.all(
        [...wrapper.querySelectorAll('img')].map(img =>
          img.complete ? img.decode().catch(() => {}) : new Promise<void>(res => {
            img.onload  = () => img.decode().catch(() => {}).finally(res);
            img.onerror = () => res();
          })
        )
      );

      // iOS fix: html-to-image embeds data URL images as-is inside the SVG
      // foreignObject. With many large HEIC-converted photos (each up to 1200×1200
      // JPEG) the SVG string becomes too large for Safari to render, silently
      // dropping the images. Solution: temporarily downscale each photo to the
      // pixel size it actually occupies in the export, run toPng(), then restore.
      const imgRestorations: { img: HTMLImageElement; orig: string }[] = [];
      await Promise.all(
        ([...wrapper.querySelectorAll('img')] as HTMLImageElement[]).map(async img => {
          if (!img.src.startsWith('data:image/')) return;
          const displayW = Math.ceil(img.offsetWidth  * scale);
          const displayH = Math.ceil(img.offsetHeight * scale);
          if (!displayW || !displayH) return;
          // Only downscale if image is larger than its display footprint
          if (img.naturalWidth <= displayW && img.naturalHeight <= displayH) return;
          const cnv = document.createElement('canvas');
          cnv.width  = displayW;
          cnv.height = displayH;
          const ctx2d = cnv.getContext('2d')!;
          // Fill with the cell's computed background colour first so that if
          // drawImage fails to render (HEIC on iOS), empty pixels stay the cell
          // colour rather than becoming black when converted to an opaque format.
          ctx2d.fillStyle = getComputedStyle(img.parentElement ?? img).backgroundColor || '#ece7df';
          ctx2d.fillRect(0, 0, displayW, displayH);
          ctx2d.drawImage(img, 0, 0, displayW, displayH);
          // Use PNG so any remaining transparent pixels stay transparent instead
          // of being collapsed to black by JPEG's lack of alpha channel.
          const smallUrl = cnv.toDataURL('image/png');
          imgRestorations.push({ img, orig: img.src });
          img.src = smallUrl;
          await img.decode().catch(() => {});
        })
      );

      // iOS / WebKit fix: html-to-image serialises via SVG foreignObject.
      // On the first pass resources are loaded into the SVG context but not
      // yet composited; the second pass captures them correctly.
      const exportOptions = { pixelRatio: scale, cacheBust: true } as const;
      await toPng(wrapper, exportOptions).catch(() => {}); // warm-up pass
      const journalDataUrl = await toPng(wrapper, exportOptions);

      // Restore original high-res sources after capture
      for (const { img, orig } of imgRestorations) img.src = orig;

      fontStyle?.remove();
      noShadowStyle.remove();
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
        // Fall back to whatever color is currently rendered on the page body
        const renderedBg = bgValue || getComputedStyle(document.body).backgroundColor;
        ctx.fillStyle = renderedBg;
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
      const monthName = new Date(year, month).toLocaleString('en-US', { month: 'long' }).toLowerCase();
      a.download = `${monthName}-${year}-journal.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {showExtractModal && (
        <ExtractModal
          onUpload={(file) => { setShowExtractModal(false); handleSheetUpload(file); }}
          onCancel={() => setShowExtractModal(false)}
        />
      )}

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
            <div className={styles.stickerSectionHeader}>
              <p className={styles.sectionLabel}>Stickers</p>
              {stickerPack.length > 0 && (
                <button
                  className={styles.editStickersBtn}
                  onClick={isEditingStickers ? handleEditDone : () => setIsEditingStickers(true)}
                >
                  {isEditingStickers ? 'Done' : 'Edit'}
                </button>
              )}
            </div>

            {/* ── Favorites grid ── */}
            {favorites.length > 0 && (
              <>
                <p className={styles.favoritesLabel}>Favorites</p>
                <div className={`${styles.stickerGrid} ${isEditingStickers ? styles.stickerGridEditing : ''}`}>
                  {favorites.map(sticker => (
                    <div
                      key={sticker.id}
                      className={[
                        styles.stickerThumbWrap,
                        isEditingStickers ? styles.stickerThumbEditing : '',
                      ].join(' ')}
                      draggable={!isEditingStickers}
                      onDragStart={!isEditingStickers ? e => {
                        e.dataTransfer.setData(
                          'sticker-data',
                          JSON.stringify({ id: sticker.id, dataURL: sticker.dataURL })
                        );
                        e.dataTransfer.effectAllowed = 'copy';
                        const ghost = document.createElement('img');
                        ghost.src = sticker.dataURL;
                        ghost.width = 80;
                        ghost.height = 80;
                        ghost.style.cssText =
                          'position:fixed;top:-200px;left:-200px;object-fit:contain;pointer-events:none;';
                        document.body.appendChild(ghost);
                        e.dataTransfer.setDragImage(ghost, 40, 40);
                        requestAnimationFrame(() => document.body.removeChild(ghost));
                      } : undefined}
                      title={isEditingStickers ? undefined : 'Drag to place on calendar'}
                    >
                      {isEditingStickers ? (
                        <img src={sticker.dataURL} draggable={false} className={styles.stickerThumbImg} alt="" />
                      ) : (
                        <StickerPeelPreview src={sticker.dataURL} filterId={`fav-${sticker.id}`} />
                      )}
                      <button
                        className={`${styles.favoriteBtn} ${styles.favoriteBtnActive}`}
                        onClick={e => { e.stopPropagation(); toggleFavorite(sticker.id); }}
                        title="Remove from favorites"
                      >
                        ★
                      </button>
                      <button
                        className={`${styles.stickerThumbDelete} ${isEditingStickers ? styles.stickerThumbDeleteVisible : ''}`}
                        onClick={() => handleDeleteSticker(sticker.id)}
                        title="Remove from pack"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {stickerPack.some(s => !s.isFavorite) && (
              <div className={`${styles.stickerGrid} ${isEditingStickers ? styles.stickerGridEditing : ''}`}>
                {stickerPack.map((sticker, index) => sticker.isFavorite ? null : (
                  <div
                    key={sticker.id}
                    className={[
                      styles.stickerThumbWrap,
                      isEditingStickers ? styles.stickerThumbEditing : '',
                      draggingId === sticker.id ? styles.stickerThumbDragging : '',
                    ].join(' ')}
                    draggable
                    onDragStart={e => {
                      if (isEditingStickers) {
                        handleReorderDragStart(e, index, sticker.id);
                      } else {
                        e.dataTransfer.setData(
                          'sticker-data',
                          JSON.stringify({ id: sticker.id, dataURL: sticker.dataURL })
                        );
                        e.dataTransfer.effectAllowed = 'copy';
                        const ghost = document.createElement('img');
                        ghost.src = sticker.dataURL;
                        ghost.width = 80;
                        ghost.height = 80;
                        ghost.style.cssText =
                          'position:fixed;top:-200px;left:-200px;object-fit:contain;pointer-events:none;';
                        document.body.appendChild(ghost);
                        e.dataTransfer.setDragImage(ghost, 40, 40);
                        requestAnimationFrame(() => document.body.removeChild(ghost));
                      }
                    }}
                    onDragOver={isEditingStickers ? e => handleReorderDragOver(e, index) : undefined}
                    onDragEnd={isEditingStickers ? handleReorderDragEnd : undefined}
                    title={isEditingStickers ? 'Drag to reorder' : 'Drag to place on calendar'}
                  >
                    {isEditingStickers ? (
                      <img
                        src={sticker.dataURL}
                        draggable={false}
                        className={styles.stickerThumbImg}
                        alt=""
                      />
                    ) : (
                      <StickerPeelPreview src={sticker.dataURL} filterId={sticker.id} />
                    )}
                    <button
                      className={`${styles.favoriteBtn} ${sticker.isFavorite ? styles.favoriteBtnActive : ''}`}
                      onClick={e => { e.stopPropagation(); toggleFavorite(sticker.id); }}
                      title={sticker.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {sticker.isFavorite ? '★' : '☆'}
                    </button>
                    <button
                      className={`${styles.stickerThumbDelete} ${isEditingStickers ? styles.stickerThumbDeleteVisible : ''}`}
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
              <p className={styles.stickerEmpty}>
                No stickers yet — upload your own PNG or JPEG images and drag them onto the calendar!
              </p>
            )}

            <button
              className={styles.actionBtn}
              onClick={() => stickerInputRef.current?.click()}
            >
              + Add stickers
            </button>
            <input
              ref={stickerInputRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              style={{ display: 'none' }}
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                files.forEach(f => handleStickerUpload(f));
                e.target.value = '';
              }}
            />

            {/* ── Sticker sheet extractor ── */}
            <button
              className={`${styles.actionBtn} ${styles.addStickerPackBtn}`}
              onClick={() => setShowExtractModal(true)}
              disabled={extracting}
            >
              {extracting ? 'Extracting…' : '✦ Extract stickers from sheet'}
            </button>


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
