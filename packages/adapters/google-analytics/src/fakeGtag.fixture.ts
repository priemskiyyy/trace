type SentEvent = {
  name: string;
  parameters: Record<string, unknown>;
  user: unknown;
  properties: Record<string, unknown>;
};

/**
 * The `gtag` function of the Google tag snippet for the tests, with what
 * gtag.js as served on 2026-09-24 does with the commands the adapter sends.
 * Like the snippet's own, it pushes every command onto `dataLayer` in call
 * order, so a test reads exactly what Trace sent, lifecycle commands
 * included. A `config` with `update: true` sets the user id and merges the
 * user properties, a `null` removing one, and each event is recorded with the
 * user id and the user properties in effect before it. gtag.js sends only the
 * properties changed since the previous event; the fake records the result.
 * It does not model page views, batching, `event_callback`, the `ga-disable`
 * switch or what GA4 keeps: it proves the commands and their order, not what
 * Google stores.
 */
export const fakeGtag = () => {
  const dataLayer: unknown[][] = [];
  const sent: SentEvent[] = [];

  const state: { user: unknown; properties: Record<string, unknown> } = {
    user: null,
    properties: {},
  };

  const sdk = (...command: unknown[]) => {
    dataLayer.push(command);

    const [name, target, parameters] = command;

    if (typeof parameters !== "object" || parameters === null) {
      return;
    }

    if (name === "event" && typeof target === "string") {
      sent.push({
        name: target,
        parameters: Object.fromEntries(Object.entries(parameters)),
        user: state.user,
        properties: { ...state.properties },
      });

      return;
    }

    if (
      name !== "config" ||
      !("update" in parameters) ||
      parameters.update !== true
    ) {
      return;
    }

    if ("user_id" in parameters) {
      state.user = parameters.user_id;
    }

    if (
      !("user_properties" in parameters) ||
      typeof parameters.user_properties !== "object" ||
      parameters.user_properties === null
    ) {
      return;
    }

    for (const [key, value] of Object.entries(parameters.user_properties)) {
      if (value === null) {
        delete state.properties[key];

        continue;
      }

      state.properties[key] = value;
    }
  };

  return { sdk, dataLayer, sent };
};
