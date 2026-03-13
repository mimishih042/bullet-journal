import { useState } from 'react';
import BackgroundControl from './components/BackgroundControl';
import MonthTabs from './components/MonthTabs';
import CalendarCard from './components/CalendarCard';
import styles from './App.module.css';

const today = new Date();

export default function App() {
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  return (
    <>
      <BackgroundControl />
      <div className={styles.journalWrapper}>
        <MonthTabs activeMonth={viewMonth} onSelect={setViewMonth} />
        <CalendarCard
          year={viewYear}
          month={viewMonth}
          onPrevYear={() => setViewYear(y => y - 1)}
          onNextYear={() => setViewYear(y => y + 1)}
        />
      </div>
    </>
  );
}
