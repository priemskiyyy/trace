import type { GtagLike } from "src/types/GtagLike";

type ConfigUpdate = {
  user_id?: string | null;
  user_properties?: Record<string, unknown>;
};

export const createConfigUpdate = (sdk: GtagLike, id: string) => {
  let sent = false;

  return (parameters: ConfigUpdate) => {
    // Before the page's own config, this one configures the measurement, and without the flag it sends a page_view.
    sdk(
      "config",
      id,
      sent
        ? { update: true, ...parameters }
        : { update: true, send_page_view: false, ...parameters },
    );
    sent = true;
  };
};
