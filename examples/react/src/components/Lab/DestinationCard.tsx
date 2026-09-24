import { Plugs } from "@phosphor-icons/react";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";
import { useDestinationStatus } from "@priemskiyyy/trace-react";
import clsx from "clsx";
import type React from "react";

import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";
import { Badge } from "src/components/Badge/Badge";
import { IconTile } from "src/components/IconTile/IconTile";
import { DESTINATION_GUIDES } from "src/utils/constants/destinations";
import { DESTINATION_STATUS_LABELS } from "src/utils/constants/labels";
import { DESTINATION_STATUS_TONES } from "src/utils/constants/tones";

type DestinationCardProps = {
  name: RegisteredDestinationName;
  lastReceived: string | null;
};

export const DestinationCard: React.FunctionComponent<DestinationCardProps> = ({
  name,
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
        <IconTile icon={Plugs} size="regular" />
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
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-zinc-500">Evidence</dt>
        <dd>{guide.evidence}</dd>
        <dt className="text-zinc-500">Consent</dt>
        <dd>{guide.consent}</dd>
        <dt className="text-zinc-500">Last received</dt>
        <dd className="truncate">{lastReceived ?? "Nothing yet"}</dd>
      </dl>
    </li>
  );
};
