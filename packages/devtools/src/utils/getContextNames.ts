import { readField } from "src/utils/readField";

export const getContextNames = (context: unknown, key: string) => {
  const names = readField(context, key);

  if (!Array.isArray(names)) {
    return [];
  }

  return names.flatMap((name: unknown) => {
    if (typeof name !== "string") {
      return [];
    }

    return [name];
  });
};
