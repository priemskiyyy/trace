/** Event names `track` cannot take, because they clash with Heap's own autocaptured events. */
export const RESERVED_EVENT_NAMES = Object.freeze([
  "click",
  "change",
  "pageview",
  "submit",
]);
