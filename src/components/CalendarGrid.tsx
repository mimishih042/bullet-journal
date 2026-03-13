import CalendarCell from './CalendarCell';
import styles from './CalendarGrid.module.css';

interface Props {
  year: number;
  month: number;
}

interface CellData {
  key: string;
  day: number;
  isOtherMonth: boolean;
  dateKey: string | null;
  isToday: boolean;
}

function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

const today = new Date();

function buildCells(year: number, month: number): CellData[] {
  const cells: CellData[] = [];
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const prevMonthEnd = new Date(year, month, 0).getDate();

  // leading cells from prev month
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = prevMonthEnd - i;
    cells.push({ key: `prev-${d}`, day: d, isOtherMonth: true, dateKey: null, isToday: false });
  }

  // current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth()    === today.getMonth()    &&
      date.getDate()     === today.getDate();
    cells.push({ key: toDateKey(date), day: d, isOtherMonth: false, dateKey: toDateKey(date), isToday });
  }

  // trailing cells from next month
  const total     = firstWeekday + daysInMonth;
  const remainder = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remainder; i++) {
    cells.push({ key: `next-${i}`, day: i, isOtherMonth: true, dateKey: null, isToday: false });
  }

  return cells;
}

export default function CalendarGrid({ year, month }: Props) {
  const cells = buildCells(year, month);

  return (
    <div className={styles.grid}>
      {cells.map(cell => (
        <CalendarCell
          key={cell.key}
          day={cell.day}
          dateKey={cell.dateKey}
          isOtherMonth={cell.isOtherMonth}
          isToday={cell.isToday}
        />
      ))}
    </div>
  );
}
