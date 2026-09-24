import {
  RESERVED_PREFIX,
  RESERVED_PROPERTIES,
} from "src/utils/constants/properties";

export const isReservedKey = (key: string) =>
  key.startsWith(RESERVED_PREFIX) || RESERVED_PROPERTIES.includes(key);
