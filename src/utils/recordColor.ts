export function getRecordMinutesColor(minutes: number) {
  if (minutes < 30) {
    return '#f62e06';
  }

  if (minutes < 60) {
    return '#f06925';
  }

  if (minutes < 90) {
    return '#22B66E';
  }

  return '#056ee5';
}

export function getRecordProgressColor(progress: number) {
  if (progress < 0.5) {
    return '#f62e06';
  }

  if (progress < 1) {
    return '#f06925';
  }

  return '#22B66E';
}
