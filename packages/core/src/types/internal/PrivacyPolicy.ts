import type { TraceLimits } from "src/types/TraceLimits";

export type PrivacyPolicy = {
  redact: (key: string, path: string) => boolean;
  limits: TraceLimits;
};
