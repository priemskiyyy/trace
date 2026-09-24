// String prints an object variant as [object Object], and JSON has no form for undefined, a bigint or a cycle.
const getDescription = (value: unknown) => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export const assertUnreachable = (value: never): never => {
  throw new Error(`Unexpected value: ${getDescription(value)}`);
};
