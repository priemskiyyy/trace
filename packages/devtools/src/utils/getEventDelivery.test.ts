import { expect, test } from "vitest";

import { createAcceptedRow } from "src/utils/createAcceptedRow.fixture";
import { createDiagnosticRow } from "src/utils/createDiagnosticRow.fixture";
import { getEventDelivery } from "src/utils/getEventDelivery";

const accepted = createAcceptedRow({
  id: 2,
  type: "Checkout Started",
  summary: "#1 · ada",
});

const acceptance = createDiagnosticRow({
  id: 1,
  type: "event accepted",
  destination: null,
  losses: [{ path: "properties.card.cvc", reason: "redacted" }],
  destinations: ["product", "backend", "archive"],
});

test("each routed destination has its outcome as it lands, in the order of the route, and the rest are pending", () => {
  const submitted = createDiagnosticRow({
    id: 3,
    type: "event submitted",
    summary: "sdk-call-returned · 2 losses",
    losses: [
      { path: "properties.card.cvc", reason: "redacted" },
      { path: "timestamp", reason: "unsupported" },
    ],
  });

  const failed = createDiagnosticRow({
    id: 4,
    type: "event failed",
    destination: { name: "backend" },
    kind: "ERROR",
  });

  const elsewhere = createDiagnosticRow({
    id: 5,
    type: "event submitted",
    destination: { name: "archive" },
    event: { id: "e_2" },
  });

  const unrouted = createDiagnosticRow({
    id: 6,
    type: "event dropped",
    destination: { name: "legacy" },
    kind: "ERROR",
    summary: "consent",
  });

  const overflow = createDiagnosticRow({
    id: 7,
    type: "buffer overflow",
    source: "destination",
    destination: { name: "archive" },
    kind: "ERROR",
  });

  const unrelated = createDiagnosticRow({
    id: 8,
    type: "event failed",
    destination: { name: "archive" },
    event: null,
    kind: "ERROR",
  });

  expect(
    getEventDelivery(
      [
        unrelated,
        overflow,
        unrouted,
        elsewhere,
        failed,
        submitted,
        accepted,
        acceptance,
      ],
      accepted,
    ),
  ).toEqual({
    losses: [{ path: "properties.card.cvc", reason: "redacted" }],
    outcomes: [
      {
        destination: "product",
        status: "submitted",
        summary: "sdk-call-returned · 2 losses",
        losses: [
          { path: "properties.card.cvc", reason: "redacted" },
          { path: "timestamp", reason: "unsupported" },
        ],
      },
      { destination: "backend", status: "failed", summary: "", losses: [] },
      { destination: "archive", status: "pending", summary: "", losses: [] },
      {
        destination: "legacy",
        status: "dropped",
        summary: "consent",
        losses: [],
      },
    ],
  });
});

test("every outcome a destination can land is read from its diagnostic", () => {
  const statuses = [
    "event submitted",
    "event dropped",
    "event skipped",
    "event failed",
    "event indeterminate",
  ].map(
    (type, index) =>
      getEventDelivery(
        [createDiagnosticRow({ id: index + 3, type }), accepted, acceptance],
        accepted,
      ).outcomes[0]?.status,
  );

  expect(statuses).toEqual([
    "submitted",
    "dropped",
    "skipped",
    "failed",
    "indeterminate",
  ]);
});

test("an event whose acceptance is no longer recorded lists the outcomes that landed", () => {
  expect(
    getEventDelivery(
      [
        createDiagnosticRow({
          id: 3,
          type: "event skipped",
          summary: "identity-failed",
        }),
        accepted,
      ],
      accepted,
    ),
  ).toEqual({
    losses: [],
    outcomes: [
      {
        destination: "product",
        status: "skipped",
        summary: "identity-failed",
        losses: [],
      },
    ],
  });
});

test("an accepted event named like a diagnostic is never mistaken for one", () => {
  const namedLikeAcceptance = createAcceptedRow({
    id: 2,
    type: "event accepted",
  });

  expect(
    getEventDelivery([namedLikeAcceptance, acceptance], namedLikeAcceptance),
  ).toEqual({
    losses: [{ path: "properties.card.cvc", reason: "redacted" }],
    outcomes: [
      { destination: "product", status: "pending", summary: "", losses: [] },
      { destination: "backend", status: "pending", summary: "", losses: [] },
      { destination: "archive", status: "pending", summary: "", losses: [] },
    ],
  });
});
