type Call = { to: unknown; context: unknown; timestamp: unknown };

const NO_CALL: Call = Object.freeze({
  to: undefined,
  context: undefined,
  timestamp: undefined,
});

export const readCall = (options: unknown): Call | null => {
  if (options === undefined || options === null) {
    return NO_CALL;
  }

  // A JavaScript caller can pass anything as the options.
  if (typeof options !== "object") {
    return null;
  }

  try {
    if (Array.isArray(options)) {
      return null;
    }

    const { to, context, timestamp }: Partial<Call> = options;

    return { to, context, timestamp };
  } catch {
    return null;
  }
};
