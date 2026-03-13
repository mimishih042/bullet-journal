import styles from './MonthTabs.module.css';

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

interface Props {
  activeMonth: number;
  onSelect: (month: number) => void;
}

export default function MonthTabs({ activeMonth, onSelect }: Props) {
  return (
    <nav className={styles.tabs}>
      {MONTH_ABBR.map((abbr, i) => (
        <button
          key={abbr}
          className={`${styles.tab}${i === activeMonth ? ` ${styles.active}` : ''}`}
          onClick={() => onSelect(i)}
        >
          {abbr}
        </button>
      ))}
    </nav>
  );
}
