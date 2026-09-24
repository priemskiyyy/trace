import { Eraser, Terminal } from "@phosphor-icons/react";
import type React from "react";

import type { createOrdersBackend } from "example-shared/backend/createOrdersBackend";
import { formatDuration } from "example-shared/formatting/formatDuration";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { Badge } from "src/components/Badge/Badge";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { Panel } from "src/components/Panel/Panel";
import { useEventLog } from "src/hooks/useEventLog";
import { REQUEST_LABELS } from "src/utils/constants/labels";
import { REQUEST_TONES } from "src/utils/constants/tones";

type NetworkPanelProps = { backend: ReturnType<typeof createOrdersBackend> };

export const NetworkPanel: React.FunctionComponent<NetworkPanelProps> = ({
  backend,
}) => {
  const requests = useEventLog(backend.requests);

  return (
    <Panel
      title="Network"
      icon={Terminal}
      shows="What your own API received from the HTTP adapter, newest first."
      aside={
        <button
          type="button"
          disabled={requests.length === 0}
          onClick={backend.requests.clear}
          className={buttonStyles({ size: "small" })}
        >
          <Eraser aria-hidden="true" size={14} weight="bold" />
          Clear
        </button>
      }
    >
      {requests.length === 0 ? (
        <EmptyState
          icon={Terminal}
          title="No requests yet"
          description="Check out to send an order to your own API."
        />
      ) : (
        <ol
          aria-label="Requests"
          className="flex max-h-[28rem] flex-col divide-y divide-zinc-200/70 overflow-y-auto text-sm dark:divide-zinc-800"
        >
          {requests.map((request) => (
            <li
              key={request.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2.5"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-mono">
                  <span className="font-semibold">POST</span> /api/orders
                </span>
                <span className="truncate font-mono text-xs text-zinc-500">
                  {request.orderId} · {request.account ?? "anonymous"}
                </span>
              </span>
              <Badge tone={REQUEST_TONES[request.outcome]}>
                {REQUEST_LABELS[request.outcome]}
              </Badge>
              <span className="w-16 text-right font-mono text-zinc-500 tabular-nums">
                {formatDuration(request.duration)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
};
