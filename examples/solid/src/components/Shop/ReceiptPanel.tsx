import type { Component } from "solid-js";
import { Show } from "solid-js";

import { BasePanel } from "src/components/BasePanel/BasePanel";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { LatestReceipt } from "src/components/Shop/LatestReceipt";
import type { TrackedReceipt } from "src/types/TrackedReceipt";

type ReceiptPanelProps = { tracked: TrackedReceipt | null };

export const ReceiptPanel: Component<ReceiptPanelProps> = (props) => (
  <BasePanel
    title="Latest receipt"
    shows="What every destination did with the last event you tracked, with its evidence and losses."
  >
    <Show
      when={props.tracked}
      keyed
      fallback={
        <EmptyState
          title="Nothing tracked yet"
          description="Add a product to the cart and check out to see a receipt."
        />
      }
    >
      {(tracked) => <LatestReceipt tracked={tracked} />}
    </Show>
  </BasePanel>
);
