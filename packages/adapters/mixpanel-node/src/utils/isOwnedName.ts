import {
  OWNED_PREFIXES,
  OWNED_PROPERTIES,
} from "src/utils/constants/properties";

export const isOwnedName = (name: string) =>
  OWNED_PROPERTIES.includes(name) ||
  OWNED_PREFIXES.some((prefix) => name.startsWith(prefix));
