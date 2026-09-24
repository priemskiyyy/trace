import type { ConsentDecision } from "@priemskiyyy/trace";
import { useDestinationStatus } from "@priemskiyyy/trace-react";
import clsx from "clsx";
import type React from "react";

import { DESTINATION_GUIDES } from "example-shared/boutique/reporting/constants/destinations";
import {
  COLLECTION_LABELS,
  CONSENT_LABELS,
  DESTINATION_STATUS_LABELS,
} from "example-shared/boutique/reporting/constants/labels";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { CollectionState } from "example-shared/boutique/reporting/types/CollectionState";
import {
  COLLECTION_TONES,
  CONSENT_TONES,
  DESTINATION_STATUS_TONES,
} from "example-shared/ui/constants/tones";
import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";
import { Badge } from "src/components/Badge/Badge";
import { IconTile } from "src/components/IconTile/IconTile";
import { DESTINATION_ICONS } from "src/utils/constants/icons";

type DestinationCardProps = {
  name: BoutiqueDestination;
  consent: ConsentDecision;
  collection: CollectionState | null;
  group: string | null;
  lastReceived: string | null;
};

export const DestinationCard: React.FunctionComponent<DestinationCardProps> = ({
  name,
  consent,
  collection,
  group,
  lastReceived,
}) => {
  const status = useDestinationStatus(name);
  const guide = DESTINATION_GUIDES[name];

  return (
    <li
      aria-label={guide.name}
      className={clsx("flex min-w-0 flex-col gap-3 p-4", CARD_CLASS_NAME)}
    >
      <div className="flex items-start gap-3">
        <IconTile icon={DESTINATION_ICONS[name]} size="regular" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{guide.name}</h4>
            <Badge tone={DESTINATION_STATUS_TONES[status.state]}>
              {DESTINATION_STATUS_LABELS[status.state]}
            </Badge>
          </div>
          <p className="truncate font-mono text-xs text-zinc-500">
            {guide.provider}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-zinc-500">Consent</dt>
        <dd>
          {guide.consent.gated ? (
            <Badge tone={CONSENT_TONES[consent]}>
              {CONSENT_LABELS[consent]}
            </Badge>
          ) : (
            "Not gated: it is Boutique's own API"
          )}
        </dd>
        {collection === null ? null : (
          <>
            <dt className="text-zinc-500">Own switch</dt>
            <dd>
              {collection === "none" ? (
                COLLECTION_LABELS.none
              ) : (
                <Badge tone={COLLECTION_TONES[collection]}>
                  {COLLECTION_LABELS[collection]}
                </Badge>
              )}
            </dd>
          </>
        )}
        {group === null ? null : (
          <>
            <dt className="text-zinc-500">Group</dt>
            <dd>{group}</dd>
          </>
        )}
        <dt className="text-zinc-500">Evidence</dt>
        <dd>{guide.evidence}</dd>
        <dt className="text-zinc-500">Last received</dt>
        <dd className="truncate">{lastReceived ?? "Nothing yet"}</dd>
      </dl>
    </li>
  );
};
