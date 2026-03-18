import { useState, useEffect } from 'react';
import styles from './LeftPanel.module.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  year: number;
  month: number;
  onPrevYear: () => void;
  onNextYear: () => void;
}

function panelKey(year: number, month: number, field: string) {
  return `panel-${year}-${month}-${field}`;
}

function useLocalText(key: string) {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? '');

  useEffect(() => {
    setValue(localStorage.getItem(key) ?? '');
  }, [key]);

  const set = (text: string) => {
    setValue(text);
    localStorage.setItem(key, text);
  };

  return [value, set] as const;
}

export default function LeftPanel({ year, month, onPrevYear, onNextYear }: Props) {
  const [notes, setNotes] = useLocalText(panelKey(year, month, 'notes'));

  return (
    <div className={styles.leftPanel}>

      {/* Month header */}
      <div className={styles.panelHeader}>
        <span className={styles.monthNumber}>{String(month + 1).padStart(2, '0')+ '/'}</span>
        <h2 className={styles.monthName}>{MONTH_NAMES[month]}</h2>
      </div>

      {/* Notes — sticky note style */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Notes</span>
        <textarea
          className={`${styles.textarea}`}
          placeholder="anything on your mind..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <div>{year}</div>
    </div>
  );
}
