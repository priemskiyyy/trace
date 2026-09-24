export type DestinationGuide = {
  name: string;
  provider: string;
  evidence: string;
  consent: { gated: boolean; ownSwitch: boolean };
};
