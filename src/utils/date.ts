import i18n from '@/i18n';

export type CalendarCell = {
  key: string;
  day: number | null;
  dayKey: string | null;
};

export type RecordUnit = 'hours' | 'minutes';

const pad2 = (value: number) => String(value).padStart(2, '0');

function getWeekdayLabels() {
  return i18n.t('date.weekdays', { returnObjects: true }) as string[];
}

export function formatDayKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function getCalendarDayDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getCalendarDayKey(date: Date) {
  return formatDayKey(getCalendarDayDate(date));
}

// Backward-compatible aliases. Day ownership always follows the calendar date;
// startTimeMinutes is only used for minute calculation.
export function getLogicalDayDate(date: Date, _startTimeMinutes: number) {
  return getCalendarDayDate(date);
}

export function getLogicalDayKey(date: Date, _startTimeMinutes: number) {
  return getCalendarDayKey(date);
}

export function getMinutesSinceDayStart(date: Date, startTimeMinutes: number) {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  return Math.max(0, currentMinutes - startTimeMinutes);
}

export function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function formatMonthTitle(date: Date) {
  return i18n.t('date.monthTitle', {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  });
}

export function formatDayLabel(dayKey: string) {
  const [, month, day] = dayKey.split('-');

  return i18n.t('date.dayLabel', {
    month: Number(month),
    day: Number(day),
  });
}

export function formatWeekdayLabel(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return getWeekdayLabels()[date.getDay()];
}

export function formatDayWithWeekdayLabel(dayKey: string) {
  return `${formatDayLabel(dayKey)} ${formatWeekdayLabel(dayKey)}`;
}

export function formatTimeFromMinutes(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

function getDecimalHours(totalMinutes: number) {
  return Math.round((totalMinutes / 60) * 10) / 10;
}

function formatDecimalHours(totalMinutes: number) {
  const roundedHours = getDecimalHours(totalMinutes);

  return String(roundedHours);
}

export function formatDuration(totalMinutes: number, unit: RecordUnit = 'minutes') {
  if (unit === 'minutes') {
    return i18n.t('date.durationMinutes', { value: totalMinutes });
  }

  if (totalMinutes < 60) {
    return i18n.t('date.durationMinutes', { value: totalMinutes });
  }

  return i18n.t('date.durationDecimalHours', {
    value: formatDecimalHours(totalMinutes),
  });
}

export function formatDetailedDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return i18n.t('date.durationMinutes', { value: minutes });
  }

  if (minutes > 0) {
    return i18n.t('date.durationHoursMinutes', { hours, minutes });
  }

  return i18n.t('date.durationHoursOnly', { hours });
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
