import type { Section } from "src/types/Section";
import type { SectionId } from "src/types/SectionId";

export const SECTIONS: Record<SectionId, Section> = {
  shop: { number: 1, title: "One checkout, six answers", label: "Shop" },
  receipts: {
    number: 2,
    title: "Every event keeps its shopper",
    label: "Receipts",
  },
  destinations: {
    number: 3,
    title: "Consent reaches every destination",
    label: "Destinations",
  },
  lab: { number: 4, title: "Break one destination", label: "Lab" },
  timeline: { number: 5, title: "Watch it happen", label: "Timeline" },
};

export const SECTION_IDS: SectionId[] = [
  "shop",
  "receipts",
  "destinations",
  "lab",
  "timeline",
];
