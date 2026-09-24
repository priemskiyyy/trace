---
description: "Put the user in a group such as a workspace or a team with trace.group, change or leave it, type its traits, and see how each provider carries a group."
---

# Groups

```ts
trace.group("workspace", {
  id: "workspace_1",
  traits: { plan: "team", seats: 12 },
});
trace.group("workspace", { id: "workspace_1", traits: { seats: 14 } });
trace.group("workspace", null);
```

A group is a membership of the current user, or of the anonymous visitor, for one group type, such as a workspace, a team or a company. Each type holds one membership at a time. Every event carries the memberships held when it was tracked, in `event.identity.groups`.

## The rules

| Call                                                         | Result                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `group("workspace", { id: "w_1", traits })`, in no workspace | Joins `w_1` with those traits.                           |
| `group("workspace", { id: "w_1", traits })`, in `w_1`        | The same membership, so the traits merge.                |
| `group("workspace", { id: "w_2", traits })`, in `w_1`        | Replaces the membership, and `w_2`'s traits start fresh. |
| `group("workspace", { id: "w_1", traits: { seats: null } })` | Removes the group trait `seats`.                         |
| `group("workspace", null)`                                   | Leaves the workspace.                                    |

- Memberships set while anonymous are kept when the visitor signs in, because they describe the same person. A user switch or a sign-out clears them, with the traits. See [users and account switching](users.md#generations).
- A type or an id that is not a string, or is empty or only whitespace, is refused with the diagnostic `group refused`, and nothing changes.
- A user holds at most as many group types as `privacy.limits.breadth` allows, 50 by default. A further type is refused as `group refused`, while a type already held can still change.
- Group traits are sanitized when they are set, and `redact` is asked about each key with its path, such as `groups.workspace.billingEmail`. See [privacy and redaction](privacy.md).

## Typed groups

With `schema.groups`, `group()` accepts only the types it declares, each with its own validators:

```ts
import { Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { z } from "zod";

const trace = new Trace({
  events,
  destinations: { console: console() },
  schema: {
    groups: {
      workspace: { plan: z.enum(["free", "team"]), seats: z.number().int() },
    },
  },
});

trace.group("workspace", { id: "workspace_1", traits: { plan: "team" } });
```

At runtime, a type the schema does not declare is refused as `group refused`. An invalid value or an undeclared trait costs only itself: the membership still applies, and the diagnostic `traits refused` names the path, such as `groups.workspace.seats`.

## What each provider receives

Trace sends a `group` step for each membership that changed, and one with an `id` of `null` for each group left, awaited like every identity step before the events that follow. A provider that cannot carry a change reports it as the diagnostic `identity step unsupported`, and Trace never imitates it:

| Destination                                 | A membership                                                                                  | Leaving                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Amplitude                                   | `setGroup`, and `groupIdentify` for its traits                                                | `setGroup(type, [])`, best effort: Amplitude documents no leave |
| Ampli                                       | none: the generated wrapper has no group call                                                 | none                                                            |
| PostHog, in the browser and on React Native | `group(type, id, traits)`                                                                     | `$groups` registered again without that type                    |
| PostHog on a server                         | carried by each later event, with the traits sent through `groupIdentify`                     | the next event no longer carries it                             |
| Mixpanel                                    | `set_group`, with the group's own traits on its group profile                                 | `unregister` and `people.unset` of the type                     |
| Mixpanel on React Native                    | `setGroup`; group traits are unsupported                                                      | the super property and the profile property removed             |
| Mixpanel on a server                        | the membership on the user's profile and on each later event, the traits on the group profile | `people.unset` of the type                                      |
| Segment and RudderStack                     | one `group` call, for the one type you configure with `group: { type }`                       | unsupported: they have no call to leave a group                 |
| Google Analytics, Firebase and Heap         | none: the provider has no group analytics                                                     | none                                                            |
| HTTP                                        | in each event, as `event.identity.groups`                                                     | the next event no longer carries it                             |
| Console                                     | one printed line                                                                              | one printed line                                                |
| Plausible, Umami, Fathom and Vercel         | none: their adapters carry no groups                                                          | none                                                            |

Each provider's page has the details, such as Mixpanel's Group Analytics add-on. See [choose an adapter](adapters.md).
