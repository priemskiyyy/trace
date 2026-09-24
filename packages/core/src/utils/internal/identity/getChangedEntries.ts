export const getChangedEntries = (
  held: Record<string, unknown>,
  wanted: Record<string, unknown>,
) =>
  Object.entries(wanted).filter(
    ([key, value]) => !Object.hasOwn(held, key) || !Object.is(held[key], value),
  );
