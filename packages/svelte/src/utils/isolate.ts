// Throw outside the caller, so the failure reaches the host as the core reports a listener's.
const reportUnhandledError = (error: unknown) => {
  queueMicrotask(() => {
    throw error;
  });
};

export const isolate = (callback: () => unknown) => {
  try {
    const result = callback();

    if (result !== undefined) {
      new Promise((resolve) => resolve(result)).catch(reportUnhandledError);
    }
  } catch (error) {
    reportUnhandledError(error);
  }
};
