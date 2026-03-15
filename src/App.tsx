import { useState, useEffect } from 'react';
import BackgroundControl from './components/BackgroundControl';
import MonthTabs from './components/MonthTabs';
import CalendarCard from './components/CalendarCard';
import styles from './App.module.css';

const today = new Date();

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

  if (isNarrow) {
    return (
      <div className={styles.mobileNotice}>
        <span className={styles.mobileNoticeIcon}>💻</span>
        <p className={styles.mobileNoticeTitle}>Best on a larger screen</p>
        <p className={styles.mobileNoticeText}>
          This journal works best on a larger screen. Please open it on a desktop or tablet to create your page
        </p>
      </div>
    );
  }

  return (
    <div className={styles.pageRoot}>
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
      </div>

      <BackgroundControl
        open={panelOpen}
        onToggle={() => setPanelOpen(o => !o)}
        year={viewYear}
        month={viewMonth}
      />
    </div>
  );
}
