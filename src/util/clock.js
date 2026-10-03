export const systemClock = { now: () => new Date() };
export const fixedClock = (iso) => ({ now: () => new Date(iso) });
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export const nyDate = (date) => NY.format(date); // 'YYYY-MM-DD'
