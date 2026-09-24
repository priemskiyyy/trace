import { MAX_NAME_BYTES, MAX_NAME_LENGTH } from "src/utils/constants/limits";

export const isPropertyName = (name: string) =>
  name.length <= MAX_NAME_LENGTH &&
  new TextEncoder().encode(name).length <= MAX_NAME_BYTES;
