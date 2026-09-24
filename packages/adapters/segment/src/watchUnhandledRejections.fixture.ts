import { onTestFinished } from "vitest";

/**
 * Records every rejection nothing handled while a test runs. It proves that no
 * rejection went unhandled before `settle` returned; a rejection handled late,
 * or one raised after the test finished, is not seen.
 */
export const watchUnhandledRejections = () => {
  const rejections: unknown[] = [];

  const handleRejection = (reason: unknown) => {
    rejections.push(reason);
  };

  process.on("unhandledRejection", handleRejection);
  onTestFinished(() => {
    process.off("unhandledRejection", handleRejection);
  });

  return {
    rejections,
    // Node reports a rejection nothing handled once the microtask queue drains, so one turn of the event loop is enough.
    settle: () =>
      new Promise((resolve) => {
        setImmediate(resolve);
      }),
  };
};
