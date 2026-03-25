/**
 * All dates stored as UTC in the database.
 * Always display in Asia/Manila timezone.
 */

export const PH_TIMEZONE = 'Asia/Manila';

export const toPhTime = (date: Date): string =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: PH_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const addHours = (date: Date, hours: number): Date => {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
};

export const isExpired = (date: Date): boolean =>
  new Date() > date;