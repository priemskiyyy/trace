export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  // A proxy's prototype trap can throw, and a revoked proxy always does.
  try {
    const prototype = Reflect.getPrototypeOf(value);

    return prototype === null || Reflect.getPrototypeOf(prototype) === null;
  } catch {
    return false;
  }
};
