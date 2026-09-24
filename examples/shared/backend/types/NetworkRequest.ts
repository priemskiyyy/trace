export type NetworkRequest = {
  id: number;
  orderId: string;
  account: string | null;
  outcome: "accepted" | "failed" | "aborted";
  duration: number;
  at: number;
};
