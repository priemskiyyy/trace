const reportUnhandledError = (error: unknown) => {
  queueMicrotask(() => {
    throw error;
  });
};

export const isolate = (
  callback: () => unknown,
  handleFailure: () => void = () => {},
) => {
  const handleError = (error: unknown) => {
    handleFailure();
    reportUnhandledError(error);
  };

  try {
    const result = callback();

    if (result !== undefined) {
      new Promise((resolve) => resolve(result)).catch(handleError);
    }
  } catch (error) {
    handleError(error);
  }
};
