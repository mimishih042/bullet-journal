import { useState, useEffect } from 'react';
import BackgroundControl from './components/BackgroundControl';
import MonthTabs from './components/MonthTabs';
import CalendarCard from './components/CalendarCard';
import { loadPhoto } from './storage';
import styles from './App.module.css';

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
  const [panelOpen,  setPanelOpen]  = useState(true);
  const isNarrow = useIsNarrow();

  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [installed,     setInstalled]     = useState(false);
  const [showNudge,     setShowNudge]     = useState(false);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

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

  const handleInstall = async () => {
    if (!installPrompt) return;
    (installPrompt as any).prompt();
    const { outcome } = await (installPrompt as any).userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

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

      {installPrompt && !installed && (
        <button className={styles.installBtn} onClick={handleInstall} data-print-hidden>
          📌 Pin to your desktop
        </button>
      )}
    </div>
  );
}
