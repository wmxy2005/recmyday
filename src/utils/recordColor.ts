export function getRecordMinutesColor(minutes: number) {
  if (minutes < 30) {
    return '#7C3AED';
  }

  if (minutes < 60) {
    return '#6D5DF6';
  }

  if (minutes < 90) {
    return '#4F46E5';
  }

  return '#2563EB';
}
