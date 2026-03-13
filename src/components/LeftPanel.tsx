import { useState, useEffect } from 'react';
import styles from './LeftPanel.module.css';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const DECOS = ['🌸','✨','⭐','🍀','🌙','🎀','🦋','🍵','🌈','💌','🖊️','📎'];

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
  const [projects, setProjects] = useLocalText(panelKey(year, month, 'projects'));
  const [goals,    setGoals]    = useLocalText(panelKey(year, month, 'goals'));
  const [notes,    setNotes]    = useLocalText(panelKey(year, month, 'notes'));

  return (
    <div className={styles.leftPanel}>

      {/* Month + year header */}
      <div className={styles.panelHeader}>
        <div className={styles.yearRow}>
          <button className={styles.yearNavBtn} onClick={onPrevYear}>&#8249;</button>
          <span className={styles.yearLabel}>{year}</span>
          <button className={styles.yearNavBtn} onClick={onNextYear}>&#8250;</button>
        </div>
        <h2 className={styles.monthName}>{MONTH_NAMES[month]}</h2>
      </div>

      {/* Project Ideas */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Project Ideas</span>
        <textarea
          className={styles.textarea}
          placeholder="what are you working on this month?"
          value={projects}
          onChange={e => setProjects(e.target.value)}
        />
      </div>

      {/* Goals */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Goals</span>
        <textarea
          className={styles.textarea}
          placeholder="goals for the month..."
          value={goals}
          onChange={e => setGoals(e.target.value)}
        />
      </div>

      {/* Notes — sticky note style */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Notes</span>
        <textarea
          className={`${styles.textarea} ${styles.textareaNote}`}
          placeholder="anything on your mind..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {/* Cute decorative stickers */}
      <div className={styles.decos}>
        {DECOS.map(d => (
          <span key={d} className={styles.deco}>{d}</span>
        ))}
      </div>

    </div>
  );
}
