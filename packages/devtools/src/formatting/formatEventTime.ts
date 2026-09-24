const pad = (value: number, length: number) =>
  String(value).padStart(length, "0");

export const formatEventTime = (timestamp: number) => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}`;
};
