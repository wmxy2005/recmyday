import type { DayRecord } from '@/data/database';
import { formatTimeFromMinutes } from '@/utils/date';

function formatClockTime(date: Date, withSeconds = false) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

export function parseRecordTime(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalizedValue = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRecordDateTime(value: string | undefined, emptyLabel: string) {
  const date = parseRecordTime(value);

  return date ? formatClockTime(date, true) : emptyLabel;
}

export function getRecordStartEndDates(record: DayRecord) {
  const endDate = new Date(record.recorded_at);
  const startDate = new Date(endDate.getTime() - record.minutes_since_start * 60000);

  return { endDate, startDate };
}

export function getRecordStartEndMinutes(record: DayRecord) {
  const { endDate, startDate } = getRecordStartEndDates(record);

  return {
    endMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
    startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
  };
}

export function formatRecordRange(record: DayRecord, startTimeMinutes: number) {
  const { end, start } = formatRecordRangeParts(record, startTimeMinutes);

  return `${start} - ${end}`;
}

export function formatRecordRangeParts(record: DayRecord, startTimeMinutes: number) {
  const { endDate, startDate } = getRecordStartEndDates(record);
  const start = formatClockTime(startDate);
  const end = formatClockTime(endDate);
  const displayStart =
    record.minutes_since_start > 0 ? start : formatTimeFromMinutes(startTimeMinutes);

  return {
    end,
    start: displayStart,
  };
}

export function formatRecordsRange(records: DayRecord[], _startTimeMinutes: number) {
  const parts = formatRecordsRangeParts(records, _startTimeMinutes);

  return parts ? `${parts.start} - ${parts.end}` : '';
}

export function formatRecordsRangeParts(records: DayRecord[], _startTimeMinutes: number) {
  if (records.length === 0) {
    return null;
  }

  const range = records.reduce(
    (currentRange, record) => {
      const { endDate, startDate } = getRecordStartEndDates(record);

      return {
        end: Math.max(currentRange.end, endDate.getTime()),
        start: Math.min(currentRange.start, startDate.getTime()),
      };
    },
    {
      end: Number.NEGATIVE_INFINITY,
      start: Number.POSITIVE_INFINITY,
    },
  );

  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    return null;
  }

  return {
    end: formatClockTime(new Date(range.end)),
    start: formatClockTime(new Date(range.start)),
  };
}
