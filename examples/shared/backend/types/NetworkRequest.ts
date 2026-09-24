export type NetworkRequest = {
  id: number;
  event: { id: string; name: string };
  user: { id: string } | null;
  outcome: "accepted" | "failed" | "aborted";
  duration: number;
  at: number;
};
