import { useState, useEffect, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { saveSetting, loadSetting, saveStickerItem, loadAllStickers, deleteStickerItem } from '../storage';
import type { StickerItem } from '../storage';
import EditIcon from '../assets/edit.svg'
import ExtractExample from '../assets/extract-example.png';
import styles from './BackgroundControl.module.css';
import extractStyles from './ExtractModal.module.css';
import { useHistoryContext } from '../context/HistoryContext';
import StickerPeelPreview from './StickerPeelPreview';
import FeedbackPrompt from './FeedbackPrompt';
import { extractStickersFromSheet } from '../utils/extractStickers';
import bowPng     from '../assets/stickers/bow.png';
import rainbowPng from '../assets/stickers/rainbow.png';
import pencilPng  from '../assets/stickers/pencil.png';
import flowerPng  from '../assets/stickers/flower.png';
import lovePng    from '../assets/stickers/love.png';
import starPng    from '../assets/stickers/star.png';

const DEFAULT_STICKERS: { id: string; src: string }[] = [
  { id: 'default-love',    src: lovePng    },
  { id: 'default-star',    src: starPng    },
  { id: 'default-bow',     src: bowPng     },
  { id: 'default-rainbow', src: rainbowPng },
  { id: 'default-flower',  src: flowerPng  },
  { id: 'default-pencil',  src: pencilPng  },
];

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
      canvas.width = width;
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
      const out = document.createElement('canvas');
      out.width = trimW;
      out.height = trimH;
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
  const history = useHistoryContext();
  const [bgColor, setBgColor] = useState('#ece7df');
  const [stickerPack, setStickerPack] = useState<StickerItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const touchDragRef = useRef<{ dataURL: string; ghost: HTMLDivElement } | null>(null);
  const currentBgRef = useRef<{ type: 'color' | 'image'; value: string }>({ type: 'color', value: '#ece7df' });
  const colorPickerBaseRef = useRef('#ece7df');
  const [extracting, setExtracting] = useState(false);
  // ── Add-stickers modal ─────────────────────────────────────────────────
  const [addModalView, setAddModalView] = useState<'select' | 'extract'>('select');
  const [extractPreviewUrl, setExtractPreviewUrl] = useState<string | null>(null);
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const extractFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const type = await loadSetting('bg-type');
      const value = await loadSetting('bg-value');
      if (type === 'color' && value) {
        document.body.style.backgroundImage = 'none';
        document.body.style.backgroundColor = value;
        setBgColor(value);
        currentBgRef.current = { type: 'color', value };
        colorPickerBaseRef.current = value;
      } else if (type === 'image' && value) {
        document.body.style.background = `url(${value}) center/cover no-repeat fixed`;
        currentBgRef.current = { type: 'image', value };
      }
    })();
  }, []);

  useEffect(() => {
    loadAllStickers().then(setStickerPack);
  }, []);

  const applyBg = useCallback(async (bg: { type: 'color' | 'image'; value: string }) => {
    if (bg.type === 'color') {
      setBgColor(bg.value);
      document.body.style.backgroundImage = 'none';
      document.body.style.backgroundColor = bg.value;
      await saveSetting('bg-type', 'color');
      await saveSetting('bg-value', bg.value);
    } else {
      document.body.style.background = `url(${bg.value}) center/cover no-repeat fixed`;
      await saveSetting('bg-type', 'image');
      await saveSetting('bg-value', bg.value);
    }
    currentBgRef.current = bg;
  }, []);

  const applyColor = async (color: string) => {
    setBgColor(color);
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundColor = color;
    await saveSetting('bg-type', 'color');
    await saveSetting('bg-value', color);
    currentBgRef.current = { type: 'color', value: color };
  };

  const applyImageFile = (file: File) => {
    const prev = { ...currentBgRef.current };
    const reader = new FileReader();
    reader.onload = async e => {
      const url = e.target!.result as string;
      await applyBg({ type: 'image', value: url });
      history.push({
        undo: () => applyBg(prev),
        redo: () => applyBg({ type: 'image', value: url }),
      });
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

  // ── Note paper ────────────────────────────────────────────────────────────
  type NotePaper = 'grid' | 'dots' | 'plain';
  const [notePaper, setNotePaper] = useState<NotePaper>(
    () => (localStorage.getItem('note-paper') as NotePaper) ?? 'grid'
  );

  const applyNotePaper = (value: NotePaper) => {
    setNotePaper(value);
    localStorage.setItem('note-paper', value);
    window.dispatchEvent(new Event('note-paper-changed'));
  };

  // ── Edit mode ─────────────────────────────────────────────────────────────
  const [isEditingStickers, setIsEditingStickers] = useState(false);

  const handleEditDone = () => setIsEditingStickers(false);

  type DisplaySticker = { id: string; dataURL: string; isFavorite: boolean; isDefault: boolean };
  const starterPack: DisplaySticker[] = DEFAULT_STICKERS.map(s => ({ id: s.id, dataURL: s.src, isFavorite: false, isDefault: true }));
  const userStickers: DisplaySticker[] = stickerPack
    .map(s => ({ id: s.id, dataURL: s.dataURL, isFavorite: s.isFavorite ?? false, isDefault: false }))
    .sort((a, b) => (a.isFavorite === b.isFavorite ? 0 : a.isFavorite ? -1 : 1));

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

  const [showAddModal, setShowAddModal] = useState(false);
  const [printMode, setPrintMode] = useState<'with-tabs' | 'no-tabs'>('with-tabs');
  const [exporting, setExporting] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [installed,     setInstalled]     = useState(false);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    (installPrompt as any).prompt();
    const { outcome } = await (installPrompt as any).userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

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
        '#journal-wrapper textarea::placeholder { color: transparent !important; }',
      ].join('\n');
      document.head.appendChild(noShadowStyle);

      // Embed font as base64 so iOS Safari canvas can use it
      const fontStyle = await inlineFont();

      // Wait for every img in the journal to be fully decoded.
      // On iOS/iPadOS the browser may not have rasterised images yet when
      // html-to-image takes its DOM snapshot, causing stickers to disappear.
      await Promise.all(
        [...wrapper.querySelectorAll('img')].map(img =>
          img.complete ? img.decode().catch(() => { }) : new Promise<void>(res => {
            img.onload = () => img.decode().catch(() => { }).finally(res);
            img.onerror = () => res();
          })
        )
      );

      // ── Pre-convert asset-URL images to data URLs ─────────────────────
      // html-to-image fetches each image URL to embed it in the SVG foreignObject.
      // On iOS Safari, same-origin asset URL fetches from within that SVG context
      // are blocked, causing sticker images (default PNG assets) to disappear.
      // Fix: convert them all to data URLs in-place before capture, then restore.
      const nonDataImgRestorations: { img: HTMLImageElement; orig: string }[] = [];
      await Promise.all(
        ([...wrapper.querySelectorAll('img')] as HTMLImageElement[]).map(async img => {
          if (img.src.startsWith('data:')) return;
          try {
            const res  = await fetch(img.src);
            const blob = await res.blob();
            const dataUrl = await new Promise<string>(resolve => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            nonDataImgRestorations.push({ img, orig: img.src });
            img.src = dataUrl;
            await img.decode().catch(() => { });
          } catch { /* skip unresolvable URLs */ }
        })
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
          const displayW = Math.ceil(img.offsetWidth * scale);
          const displayH = Math.ceil(img.offsetHeight * scale);
          if (!displayW || !displayH) return;
          // Only downscale if image is larger than its display footprint
          if (img.naturalWidth <= displayW && img.naturalHeight <= displayH) return;
          const cnv = document.createElement('canvas');
          cnv.width = displayW;
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
          await img.decode().catch(() => { });
        })
      );

      // ── Capture drawing canvas separately ─────────────────────────────
      // html-to-image's canvas serialisation (canvas.toDataURL) is unreliable
      // on iOS Safari. Instead: hide the canvas before capture, grab its pixel
      // data directly, and composite it onto the output manually.
      const wrapperRect = wrapper.getBoundingClientRect();
      const drawingCanvasEl = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
      let drawingDataUrl: string | null = null;
      let drawingCanvasRect: DOMRect | null = null;
      if (drawingCanvasEl && drawingCanvasEl.width > 0 && drawingCanvasEl.height > 0) {
        drawingDataUrl    = drawingCanvasEl.toDataURL('image/png');
        drawingCanvasRect = drawingCanvasEl.getBoundingClientRect();
        drawingCanvasEl.style.visibility = 'hidden';
      }

      // iOS / WebKit fix: html-to-image serialises via SVG foreignObject.
      // On the first pass resources are loaded into the SVG context but not
      // yet composited; the second pass captures them correctly.
      const exportOptions = { pixelRatio: scale, cacheBust: true } as const;
      await toPng(wrapper, exportOptions).catch(() => { }); // warm-up pass
      const journalDataUrl = await toPng(wrapper, exportOptions);

      // Restore canvas visibility and image sources
      if (drawingCanvasEl) drawingCanvasEl.style.visibility = '';
      for (const { img, orig } of imgRestorations) img.src = orig;
      for (const { img, orig } of nonDataImgRestorations) img.src = orig;

      fontStyle?.remove();
      noShadowStyle.remove();
      if (hideTabs && tabsEl) tabsEl.style.display = '';

      // Measure wrapper and add padding so the calendar sits centred in the
      // square with breathing room on all four sides (~15% of calendar width).
      const { width: wW, height: wH } = wrapperRect;
      const pad = wW * 0.15;
      const size = Math.max(wW + pad * 2, wH + pad * 2);

      const canvas = document.createElement('canvas');
      canvas.width = size * scale;
      canvas.height = size * scale;
      const ctx = canvas.getContext('2d')!;

      // ── Draw background (color or image) from stored settings ──────────
      const bgType = await loadSetting('bg-type');
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
              (canvas.width - drawW) / 2,
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

      // ── Composite drawing strokes on top ───────────────────────────────
      if (drawingDataUrl && drawingCanvasRect) {
        await new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => {
            const offsetX = drawingCanvasRect!.left - wrapperRect.left;
            const offsetY = drawingCanvasRect!.top  - wrapperRect.top;
            ctx.drawImage(img,
              ((size - wW) / 2 + offsetX) * scale,
              ((size - wH) / 2 + offsetY) * scale,
              drawingCanvasRect!.width  * scale,
              drawingCanvasRect!.height * scale,
            );
            resolve();
          };
          img.src = drawingDataUrl!;
        });
      }

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      const monthName = new Date(year, month).toLocaleString('en-US', { month: 'long' }).toLowerCase();
      a.download = `${monthName}-${year}-journal.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  const handleStickerTouchStart = (dataURL: string) => (e: React.TouchEvent) => {
    if (isEditingStickers) return;
    const touch = e.touches[0];

    const ghost = document.createElement('div');
    ghost.style.cssText = [
      'position:fixed',
      'width:80px',
      'height:80px',
      'pointer-events:none',
      'z-index:9999',
      'opacity:0.85',
      'transform:translate(-50%,-50%)',
      `left:${touch.clientX}px`,
      `top:${touch.clientY}px`,
    ].join(';');
    const img = document.createElement('img');
    img.src = dataURL;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    ghost.appendChild(img);
    document.body.appendChild(ghost);
    touchDragRef.current = { dataURL, ghost };

    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      if (!touchDragRef.current) return;
      const t = ev.touches[0];
      touchDragRef.current.ghost.style.left = `${t.clientX}px`;
      touchDragRef.current.ghost.style.top = `${t.clientY}px`;
    };

    const cleanup = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };

    const onEnd = (ev: TouchEvent) => {
      if (!touchDragRef.current) return;
      const t = ev.changedTouches[0];
      touchDragRef.current.ghost.remove();
      touchDragRef.current = null;
      cleanup();
      document.dispatchEvent(new CustomEvent('sticker-touch-drop', {
        detail: { dataURL, clientX: t.clientX, clientY: t.clientY },
      }));
    };

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  };

  return (
    <>
      {showAddModal && (
        <div
          className={styles.addModal}
          onClick={() => { setShowAddModal(false); setAddModalView('select'); setExtractPreviewUrl(null); setExtractFile(null); }}
        >
          <div className={styles.addModalCard} onClick={e => e.stopPropagation()}>

            {/* ── Header ── */}
            <div className={styles.addModalHeader}>
              {addModalView === 'extract' && (
                <button
                  className={styles.addModalBack}
                  onClick={() => { setAddModalView('select'); setExtractPreviewUrl(null); setExtractFile(null); }}
                >
                  ← Back
                </button>
              )}
              <span className={styles.addModalTitle}>
                {addModalView === 'select' ? 'Add stickers' : 'Extract from sticker sheet'}
              </span>
              <button
                className={styles.addModalClose}
                onClick={() => { setShowAddModal(false); setAddModalView('select'); setExtractPreviewUrl(null); setExtractFile(null); }}
              >
                ×
              </button>
            </div>

            {/* ── Selection view ── */}
            {addModalView === 'select' && (
              <div className={styles.addModalOptions}>
                <button
                  className={styles.addModalOption}
                  onClick={() => { setShowAddModal(false); stickerInputRef.current?.click(); }}
                >
                  <span className={styles.addModalOptionIcon}>🖼️</span>
                  <span className={styles.addModalOptionTitle}>Upload stickers</span>
                  <span className={styles.addModalOptionDesc}>Upload one or multiple images as stickers</span>
                </button>
                <button
                  className={`${styles.addModalOption}`}
                  onClick={() => setAddModalView('extract')}
                >
                  <span className={styles.addModalOptionIcon}>✨</span>
                  <span className={styles.addModalOptionTitle}>Extract from sticker sheet</span>
                  <span className={styles.addModalOptionDesc}>Upload a sticker sheet to create stickers</span>
                </button>
              </div>
            )}

            {/* ── Extract view ── */}
            {addModalView === 'extract' && (
              <div className={extractStyles.body}>
                <ul className={extractStyles.tips}>
                  <li>Use a sticker sheet with a <strong>white or light background</strong></li>
                  <li>Make sure stickers have clear, visible edges</li>
                </ul>
                <button
                  className={extractStyles.imageBtn}
                  onClick={() => extractFileInputRef.current?.click()}
                  title="Click to upload your sticker sheet"
                >
                  <img
                    src={extractPreviewUrl ?? ExtractExample}
                    alt=""
                    className={extractPreviewUrl ? extractStyles.previewImg : extractStyles.placeholderImg}
                  />
                  {!extractPreviewUrl && <span className={extractStyles.imageBtnHint}>Click to upload</span>}
                </button>
                <input
                  ref={extractFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setExtractFile(file);
                    setExtractPreviewUrl(URL.createObjectURL(file));
                    e.target.value = '';
                  }}
                />
                <div className={extractStyles.buttons}>
                  <button
                    className={extractStyles.cancelBtn}
                    onClick={() => { setShowAddModal(false); setAddModalView('select'); setExtractPreviewUrl(null); setExtractFile(null); }}
                  >
                    Cancel
                  </button>
                  <button
                    className={extractStyles.uploadBtn}
                    disabled={!extractFile}
                    onClick={() => {
                      if (!extractFile) return;
                      setShowAddModal(false);
                      setAddModalView('select');
                      setExtractPreviewUrl(null);
                      const file = extractFile;
                      setExtractFile(null);
                      handleSheetUpload(file);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Toggle button — always fixed top-right */}
      <button
        className={`${styles.bgBtn} ${open ? styles.bgBtnActive : ''}`}
        title={open ? 'Close panel' : 'Change background & stickers'}
        onClick={onToggle}
        disabled={isEditingStickers}
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
            {/* ── Sticker Pack ── */}
            <p className={styles.sectionLabel}>Stickers</p>

            {/* ── Starter pack ── */}
            <div className={styles.stickerGroup}>
              <div className={`${styles.stickerGrid} ${isEditingStickers ? styles.stickerGridEditing : ''}`}>
                {starterPack.map(sticker => (
                  <div
                    key={sticker.id}
                    className={[styles.stickerThumbWrap, isEditingStickers ? styles.stickerThumbEditing : ''].join(' ')}
                    draggable={!isEditingStickers}
                    onDragStart={!isEditingStickers ? e => {
                      e.dataTransfer.setData('sticker-data', JSON.stringify({ id: sticker.id, dataURL: sticker.dataURL }));
                      e.dataTransfer.effectAllowed = 'copy';
                      const ghost = document.createElement('img');
                      ghost.src = sticker.dataURL;
                      ghost.width = 80; ghost.height = 80;
                      ghost.style.cssText = 'position:fixed;top:-200px;left:-200px;object-fit:contain;pointer-events:none;';
                      document.body.appendChild(ghost);
                      e.dataTransfer.setDragImage(ghost, 40, 40);
                      requestAnimationFrame(() => document.body.removeChild(ghost));
                    } : undefined}
                    onTouchStart={!isEditingStickers ? handleStickerTouchStart(sticker.dataURL) : undefined}
                    title={isEditingStickers ? undefined : 'Drag to place on calendar'}
                  >
                    {isEditingStickers
                      ? <img src={sticker.dataURL} draggable={false} className={styles.stickerThumbImg} alt="" />
                      : <StickerPeelPreview src={sticker.dataURL} filterId={sticker.id} />
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* ── User stickers ── */}
            <div className={styles.stickerGroup}>
              <div className={styles.stickerSectionHeader}>
                <p className={styles.stickerGroupLabel}>Custom stickers</p>
                {userStickers.length > 0 && (
                  <button
                    className={styles.editStickersBtn}
                    onClick={isEditingStickers ? handleEditDone : () => setIsEditingStickers(true)}
                  >
                    {isEditingStickers ? 'Done' : 'Manage'}
                  </button>
                )}
              </div>
                <div className={`${styles.stickerGrid} ${isEditingStickers ? styles.stickerGridEditing : ''}`}>
                  {userStickers.map(sticker => (
                    <div
                      key={sticker.id}
                      className={[styles.stickerThumbWrap, isEditingStickers ? styles.stickerThumbEditing : ''].join(' ')}
                      draggable={!isEditingStickers}
                      onDragStart={!isEditingStickers ? e => {
                        e.dataTransfer.setData('sticker-data', JSON.stringify({ id: sticker.id, dataURL: sticker.dataURL }));
                        e.dataTransfer.effectAllowed = 'copy';
                        const ghost = document.createElement('img');
                        ghost.src = sticker.dataURL;
                        ghost.width = 80; ghost.height = 80;
                        ghost.style.cssText = 'position:fixed;top:-200px;left:-200px;object-fit:contain;pointer-events:none;';
                        document.body.appendChild(ghost);
                        e.dataTransfer.setDragImage(ghost, 40, 40);
                        requestAnimationFrame(() => document.body.removeChild(ghost));
                      } : undefined}
                      onTouchStart={!isEditingStickers ? handleStickerTouchStart(sticker.dataURL) : undefined}
                      title={isEditingStickers ? undefined : 'Drag to place on calendar'}
                    >
                      {isEditingStickers
                        ? <img src={sticker.dataURL} draggable={false} className={styles.stickerThumbImg} alt="" />
                        : <StickerPeelPreview src={sticker.dataURL} filterId={sticker.id} />
                      }
                      {(sticker.isFavorite || isEditingStickers) && (
                        <button
                          className={`${styles.favoriteBtn} ${isEditingStickers ? styles.favoriteBtnEditing : ''} ${sticker.isFavorite ? styles.favoriteBtnActive : ''}`}
                          onClick={isEditingStickers ? e => { e.stopPropagation(); toggleFavorite(sticker.id); } : undefined}
                          style={isEditingStickers ? undefined : { pointerEvents: 'none' }}
                          title={isEditingStickers ? (sticker.isFavorite ? 'Remove from favorites' : 'Add to favorites') : undefined}
                        >{sticker.isFavorite ? '★' : '☆'}</button>
                      )}
                      <button
                        className={`${styles.stickerThumbDelete} ${isEditingStickers ? styles.stickerThumbDeleteVisible : ''}`}
                        onClick={() => handleDeleteSticker(sticker.id)}
                        title="Remove from pack"
                      >×</button>
                    </div>
                  ))}
                </div>
            </div>

            <button
              className={styles.actionBtn}
              onClick={() => setShowAddModal(true)}
              disabled={extracting || isEditingStickers}
            >
              {extracting ? 'Extracting…' : '+ Add stickers'}
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
            
            {/* ── Note paper ── */}
            <p className={styles.sectionLabel}>Note style</p>
            <div className={styles.notePaperRow}>
              {(['grid', 'dots', 'plain'] as const).map(opt => (
                <button
                  key={opt}
                  className={`${styles.notePaperBtn} ${notePaper === opt ? styles.notePaperBtnActive : ''}`}
                  onClick={() => applyNotePaper(opt)}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>

            {/* ── Background ── */}
            <p className={styles.sectionLabel}>Background</p>
            <label className={styles.bgOption}>
              <span>Color</span>
              <input
                type="color"
                value={bgColor}
                onFocus={() => { colorPickerBaseRef.current = currentBgRef.current.value; }}
                onChange={e => applyColor(e.target.value)}
                onBlur={e => {
                  const next = e.target.value;
                  const base = colorPickerBaseRef.current;
                  if (next !== base) {
                    history.push({
                      undo: () => applyBg({ type: 'color', value: base }),
                      redo: () => applyBg({ type: 'color', value: next }),
                    });
                  }
                }}
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

            {/* ── Export ── */}
            <p className={styles.sectionLabel}>Export</p>
            <button
              className={styles.actionBtn}
              onClick={handleSavePng}
              disabled={exporting}
            >
              {exporting ? 'Saving…' : 'Save as PNG'}
            </button>

            <div className={styles.lineBreak}/>
            {installPrompt && !installed && (
              <button className={styles.subtleBtn} onClick={handleInstall}>
                📌 Add to home screen
              </button>
            )}
            <FeedbackPrompt context="customization-panel" />

          </div>
        </div>
      </div>

    </>
  );
}
