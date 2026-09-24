export const createDeferred = <TValue = void>() => {
  let resolve: (value: TValue | PromiseLike<TValue>) => void = () => {};

  let reject: (reason: unknown) => void = () => {};

  const promise = new Promise<TValue>((fulfil, fail) => {
    resolve = fulfil;
    reject = fail;
  });

  promise.catch(() => {});

  return { promise, resolve, reject };
};
