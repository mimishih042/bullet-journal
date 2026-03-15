import { useState } from 'react';
import BackgroundControl from './components/BackgroundControl';
import MonthTabs from './components/MonthTabs';
import CalendarCard from './components/CalendarCard';
import styles from './App.module.css';

const today = new Date();

export default function App() {
  const [viewYear,   setViewYear]   = useState(today.getFullYear());
  const [viewMonth,  setViewMonth]  = useState(today.getMonth());
  const [panelOpen,  setPanelOpen]  = useState(true);

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
