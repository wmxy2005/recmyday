export function getRecordMinutesColor(minutes: number) {
  if (minutes < 30) {
    return '#F04A2A';
  }

  if (minutes < 60) {
    return '#FF681E';
  }

  if (minutes < 90) {
    return '#22B66E';
  }

  return '#0D7DFF';
}
