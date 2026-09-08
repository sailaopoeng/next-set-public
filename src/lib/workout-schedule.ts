const SINGAPORE_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Singapore",
  weekday: "short",
});

export const SCHEDULED_WORKOUT_BY_DAY: Partial<Record<string, string>> = {
  Sun: "Workout A",
  Mon: "Workout A",
  Tue: "Workout B",
  Wed: "Workout B",
  Thu: "Workout C",
  Fri: "Workout C",
};

export function getSingaporeWeekday(date: Date) {
  return SINGAPORE_WEEKDAY.format(date);
}
