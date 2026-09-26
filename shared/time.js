// Thailand uses UTC+07:00. This avoids allocating an Intl formatter per ledger row.
export const schoolDate = (value) =>
  new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10);
export const schoolMonth = (value) => schoolDate(value).slice(0, 7);
