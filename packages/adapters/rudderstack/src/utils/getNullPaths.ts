export const getNullPaths = (value: unknown, path: string): string[] => {
  if (value === null) {
    return [path];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) => {
      // RudderStack's serializer keeps a null list item and leaves out a null object member.
      if (item === null) {
        return [];
      }

      return getNullPaths(item, `${path}.${index}`);
    });
  }

  if (typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]: [string, unknown]) =>
    getNullPaths(nested, `${path}.${key}`),
  );
};
