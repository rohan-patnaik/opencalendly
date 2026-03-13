export const toIsoDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const buildDefaultDashboardRange = () => {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
};
