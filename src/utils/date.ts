export type CalendarCell = {
  key: string;
  day: number | null;
  dayKey: string | null;
};

export type RecordUnit = 'hours' | 'minutes';

const pad2 = (value: number) => String(value).padStart(2, '0');
const weekdayLabels = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function formatDayKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function getLogicalDayDate(date: Date, startTimeMinutes: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getLogicalDayKey(date: Date, startTimeMinutes: number) {
  return formatDayKey(getLogicalDayDate(date, startTimeMinutes));
}

export function getMinutesSinceDayStart(date: Date, startTimeMinutes: number) {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  return Math.max(0, currentMinutes - startTimeMinutes);
}

export function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatDayLabel(dayKey: string) {
  const [, month, day] = dayKey.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

export function formatWeekdayLabel(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return weekdayLabels[date.getDay()];
}

export function formatDayWithWeekdayLabel(dayKey: string) {
  return `${formatDayLabel(dayKey)} ${formatWeekdayLabel(dayKey)}`;
}

export function formatTimeFromMinutes(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

export function formatDuration(totalMinutes: number, unit: RecordUnit = 'minutes') {
  if (unit === 'minutes') {
    return `${totalMinutes}分`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}分`;
  }

  return `${hours}小时${minutes > 0 ? `${minutes}分` : ''}`;
}

export function getMonthCalendarCells(monthDate: Date): CalendarCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const leadingEmptyCount = (firstDay.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];

  for (let index = 0; index < leadingEmptyCount; index += 1) {
    cells.push({ key: `empty-start-${index}`, day: null, dayKey: null });
  }

  for (let day = 1; day <= lastDay; day += 1) {
    cells.push({
      key: `${year}-${month}-${day}`,
      day,
      dayKey: `${year}-${pad2(month + 1)}-${pad2(day)}`,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-end-${cells.length}`, day: null, dayKey: null });
  }

  return cells;
}
