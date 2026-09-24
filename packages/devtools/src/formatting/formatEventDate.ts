export const formatEventDate = (timestamp: number) => {
  const date = new Date(timestamp);

  // An application clock can be any finite number, and toISOString throws outside the calendar.
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
};
