/** One call a simulated provider SDK received, as its inbox would show it. */
export type ProviderCall = {
  id: string;
  eventName: string;
  user: string | null;
  body: unknown;
  at: number;
};
