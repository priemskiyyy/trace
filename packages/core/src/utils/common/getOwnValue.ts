export const getOwnValue = <TValue>(
  record: Record<string, TValue>,
  key: string,
) => (Object.hasOwn(record, key) ? record[key] : undefined);
