import type { Section } from "src/types/Section";
import type { SectionId } from "src/types/SectionId";

export const SECTIONS: Record<SectionId, Section> = {
  shop: { number: 1, title: "Browse and check out", label: "Shop" },
  accounts: {
    number: 2,
    title: "Sign in, switch, sign out",
    label: "Accounts",
  },
  teams: { number: 3, title: "Join a crew", label: "Teams" },
  consent: { number: 4, title: "The consent banner", label: "Consent" },
  lab: { number: 5, title: "Break the destinations", label: "Lab" },
  timeline: { number: 6, title: "Watch it happen", label: "Timeline" },
};

export const SECTION_IDS: SectionId[] = [
  "shop",
  "accounts",
  "teams",
  "consent",
  "lab",
  "timeline",
];
