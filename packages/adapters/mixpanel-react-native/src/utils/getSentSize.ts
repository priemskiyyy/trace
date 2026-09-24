export const getSentSize = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
