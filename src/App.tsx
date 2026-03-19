import { useState, useEffect, useMemo } from 'react';
import BackgroundControl from './components/BackgroundControl';
import MonthTabs from './components/MonthTabs';
import CalendarCard from './components/CalendarCard';
import { loadPhoto } from './storage';
import styles from './App.module.css';
import { useHistory } from './hooks/useHistory';
import { HistoryContext } from './context/HistoryContext';
import UndoIcon from './assets/undo.svg';
import RedoIcon from './assets/redo.svg';

const today = new Date();
const todayKey = today.toISOString().split('T')[0];
const nudgeSeenKey = `nudge-seen-${todayKey}`;

function useIsNarrow(breakpoint = 1000) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return narrow;
}

export default function App() {
  const [viewYear,   setViewYear]   = useState(today.getFullYear());
  const [viewMonth,  setViewMonth]  = useState(today.getMonth());
  const [panelOpen,        setPanelOpen]        = useState(true);
  const [stickersLocked,   setStickersLocked]   = useState(false);
  const [stickersVisible,  setStickersVisible]  = useState(true);
  const [drawMode,       setDrawMode]       = useState(false);
  const [drawColor,      setDrawColor]      = useState('#1a1a1a');
  const [drawSize,       setDrawSize]       = useState(4);
  const [eraserMode,     setEraserMode]     = useState(false);
  const isNarrow = useIsNarrow();
  const history = useHistory();

  // Clear history when the user navigates to a different month or year
  useEffect(() => {
    history.clear();
  }, [viewYear, viewMonth, history.clear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or Ctrl+Y = redo
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (!e.shiftKey && e.key === 'z') { e.preventDefault(); history.undo(); }
      else if ((e.shiftKey && e.key === 'z') || e.key === 'y') { e.preventDefault(); history.redo(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [history.undo, history.redo]); // eslint-disable-line react-hooks/exhaustive-deps

  const historyValue = useMemo(() => ({
    push:    history.push,
    undo:    history.undo,
    redo:    history.redo,
    clear:   history.clear,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  }), [history.push, history.undo, history.redo, history.clear, history.canUndo, history.canRedo]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(nudgeSeenKey)) return;
    loadPhoto(todayKey).then(url => {
      if (!url) {
        setShowNudge(true);
        localStorage.setItem(nudgeSeenKey, '1');
      }
    });
    const hide = () => setShowNudge(false);
    window.addEventListener('today-photo-saved', hide);
    return () => window.removeEventListener('today-photo-saved', hide);
  }, []);

  if (isNarrow) {
    return (
      <div className={styles.mobileNotice}>
        <span className={styles.mobileNoticeIcon}>💻</span>
        <p className={styles.mobileNoticeTitle}>Best on a larger screen</p>
        <p className={styles.mobileNoticeText}>
          This journal works best on a larger screen. Please open it on a desktop or tablet to start your creative journey
        </p>
      </div>
    );
  }

  return (
    <HistoryContext.Provider value={historyValue}>
    <div className={styles.pageRoot}>
      {showNudge && (
        <p className={styles.nudge} data-print-hidden>
          ✦ Welcome back ✦
        </p>
      )}
      <div className={styles.journalArea} id="journal-area">
        <div className={styles.journalWrapper} id="journal-wrapper">
          <div id="month-tabs">
            <MonthTabs activeMonth={viewMonth} onSelect={setViewMonth} />
          </div>
          <CalendarCard
            year={viewYear}
            month={viewMonth}
            onPrevYear={() => setViewYear(y => y - 1)}
            onNextYear={() => setViewYear(y => y + 1)}
            stickersLocked={stickersLocked}
            stickersVisible={stickersVisible}
            drawMode={drawMode}
            drawColor={drawColor}
            drawSize={drawSize}
            eraserMode={eraserMode}
          />
        </div>

        <footer className={styles.footer} data-print-hidden>
          <div className={styles.footerCopy}>© 2026 Mimi Shih</div>
          <a href="https://instagram.com/mimishih_design" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
            ✦ Follow my art on Instagram
          </a>
        </footer>
      </div>

      <BackgroundControl
        open={panelOpen}
        onToggle={() => setPanelOpen(o => !o)}
        year={viewYear}
        month={viewMonth}
      />

      <div data-print-hidden>
        <div className={styles.actionContainer}>
          <button
            className={styles.undoBtn}
            onClick={history.undo}
            disabled={!history.canUndo}
            title="Undo (⌘Z)"
          ><img src={UndoIcon} alt="Undo" className={styles.undoIcon}/></button>
          <button
            className={styles.undoBtn}
            onClick={history.redo}
            disabled={!history.canRedo}
            title="Redo (⌘⇧Z)"
          ><img src={RedoIcon} alt="Redo" className={styles.undoIcon}/></button>
          <button
            className={`${styles.lockBtn} ${stickersLocked ? styles.lockBtnOn : ''}`}
            onClick={() => setStickersLocked(l => !l)}
            title={stickersLocked ? 'Unlock stickers' : 'Lock stickers'}
          >
            {stickersLocked ? '🔒 Unlock stickers' : '🔓 Lock stickers'}
          </button>
          <button
            className={`${styles.lockBtn} ${!stickersVisible ? styles.lockBtnOn : ''}`}
            onClick={() => setStickersVisible(v => !v)}
            title={stickersVisible ? 'Hide stickers' : 'Show stickers'}
          >
            {stickersVisible ? '👁 Hide stickers' : '🙈 Unhide stickers'}
          </button>
          <button
            className={`${styles.lockBtn} ${drawMode ? styles.lockBtnOn : ''}`}
            onClick={() => { setDrawMode(d => !d); setEraserMode(false); }}
            title={drawMode ? 'Exit draw mode' : 'Draw mode'}
          >
            ✏️ Draw
          </button>
        </div>

        {drawMode && (
          <div className={styles.drawToolbar} data-print-hidden>
            <div className={styles.drawColors}>
              <input
                type="color"
                className={`${styles.colorPickerInput} ${!eraserMode ? styles.colorPickerActive : ''}`}
                value={drawColor}
                onChange={e => { setDrawColor(e.target.value); setEraserMode(false); }}
                title="Custom color"
              />
            </div>
            <input
              type="range"
              className={styles.sizeSlider}
              min={2}
              max={24}
              value={drawSize}
              onChange={e => setDrawSize(Number(e.target.value))}
              title={`Brush size: ${drawSize}`}
            />
            <button
              className={`${styles.lockBtn} ${eraserMode ? styles.lockBtnOn : ''}`}
              onClick={() => setEraserMode(e => !e)}
              title="Eraser"
            >
              ◎ Eraser
            </button>
          </div>
        )}
      </div>
    </div>
    </HistoryContext.Provider>
  );
}
