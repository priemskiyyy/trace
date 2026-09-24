const randomHex = (length: number) =>
  Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");

const createFallbackId = () => {
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);

  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`;
};

export const createEventId = () => {
  // Hermes has no crypto.randomUUID; an event id is a correlation key, not a secret.
  const source: { randomUUID?: () => string } | undefined = globalThis.crypto;

  if (source === undefined || typeof source.randomUUID !== "function") {
    return createFallbackId();
  }

  return source.randomUUID();
};
