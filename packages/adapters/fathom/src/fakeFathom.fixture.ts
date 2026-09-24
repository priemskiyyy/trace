type EventOptions = { _value?: number; _site_id?: string };

type SentEvent = { name: string; payload: EventOptions };

/**
 * `fathom-client` 3.7.2 for the tests, with the Fathom script it loads.
 * Before the script has loaded, `trackEvent` queues the call, as
 * `fathom-client` does, and `load` sends the queue once the script is there;
 * a script that never loads, such as one a content blocker stopped, keeps it
 * queued. `blockTrackingForMe` makes the script ignore every event, as its
 * own exclusion does. It counts `load`, `setSite`, page views, goals and the
 * tracking switches, which Trace must never call. It proves the calls the
 * adapter makes; the real `fathom-client` in jsdom proves its queue.
 */
export const fakeFathom = ({ loaded = true }: { loaded?: boolean } = {}) => {
  const state = { loaded, blocked: false };
  const queue: [name: string, options: EventOptions | undefined][] = [];
  const sent: SentEvent[] = [];

  const calls: {
    trackEvent: [name: string, options: EventOptions | undefined][];
    load: number;
    setSite: number;
    trackPageview: number;
    trackGoal: number;
    blockTrackingForMe: number;
    enableTrackingForMe: number;
  } = {
    trackEvent: [],
    load: 0,
    setSite: 0,
    trackPageview: 0,
    trackGoal: 0,
    blockTrackingForMe: 0,
    enableTrackingForMe: 0,
  };

  const send = (name: string, options: EventOptions | undefined) => {
    if (!state.blocked) {
      sent.push({ name, payload: options ?? {} });
    }
  };

  const sdk = {
    trackEvent: (name: string, options?: EventOptions) => {
      calls.trackEvent.push([name, options]);

      if (!state.loaded) {
        queue.push([name, options]);

        return;
      }

      send(name, options);
    },
    load: () => {
      calls.load += 1;
      state.loaded = true;

      for (const [name, options] of queue.splice(0)) {
        send(name, options);
      }
    },
    setSite: () => {
      calls.setSite += 1;
    },
    trackPageview: () => {
      calls.trackPageview += 1;
    },
    trackGoal: () => {
      calls.trackGoal += 1;
    },
    blockTrackingForMe: () => {
      calls.blockTrackingForMe += 1;
      state.blocked = true;
    },
    enableTrackingForMe: () => {
      calls.enableTrackingForMe += 1;
      state.blocked = false;
    },
  };

  return { sdk, state, queue, sent, calls };
};
