import * as Amplitude from "@amplitude/analytics-browser";
import * as AmplitudeNode from "@amplitude/analytics-node";
import { Trace } from "@priemskiyyy/trace";
import type { EventProperties, TrackOptions } from "@priemskiyyy/trace";
import { expectTypeOf } from "vitest";

import { ampli } from "src/ampli";
import {
  ampli as generated,
  EventNoProperties,
  EventObjectTypes,
  EventWithAllProperties,
  EventWithConstTypes,
  EventWithEnumTypes,
  EventWithOptionalProperties,
} from "src/ampli-v2-generated";
import type {
  Ampli,
  BrowserClient,
  EventObjectTypesProperties,
  EventWithAllPropertiesProperties,
  EventWithEnumTypesProperties,
  EventWithOptionalPropertiesProperties,
} from "src/ampli-v2-generated";
import { fakeAmpli } from "src/fakeAmpli.fixture";
import { fromAmpli } from "src/fromAmpli";
import { identityPlugin } from "src/identityPlugin";
import type { AmpliEventOptions } from "src/types/AmpliEventOptions";
import type { AmpliLike } from "src/types/AmpliLike";
import type { AmplitudeIdentifyLike } from "src/types/AmplitudeIdentifyLike";
import type { IdentityPlugin } from "src/types/IdentityPlugin";

type ModelledAmpli = Pick<Ampli, "isLoaded" | "load" | "identify" | "track"> & {
  client: Pick<
    BrowserClient,
    | "init"
    | "identify"
    | "getDeviceId"
    | "add"
    | "reset"
    | "setOptOut"
    | "flush"
  >;
};

type FakeClient = ReturnType<typeof fakeAmpli>["sdk"]["client"];

const plugin = identityPlugin();

export const sdk: AmpliLike = generated;
export const fake: AmpliLike = fakeAmpli().sdk;
export const identify: AmplitudeIdentifyLike = new Amplitude.Identify();
export const added = generated.client.add(plugin);

expectTypeOf(fakeAmpli().sdk).toExtend<ModelledAmpli>();
expectTypeOf<IdentityPlugin>().toExtend<Amplitude.Types.EnrichmentPlugin>();
expectTypeOf<IdentityPlugin>().toExtend<Parameters<BrowserClient["add"]>[0]>();
expectTypeOf<
  Parameters<FakeClient["add"]>[0]
>().toEqualTypeOf<IdentityPlugin>();
expectTypeOf<ReturnType<FakeClient["add"]>>().toExtend<
  ReturnType<BrowserClient["add"]>
>();
expectTypeOf<AmpliEventOptions>().toExtend<Amplitude.Types.EventOptions>();

const takesFlushable = (wrapper: { flush: () => unknown }) => wrapper;

// @ts-expect-error The generated wrapper has no flush of its own, so the adapter flushes through ampli.client.
takesFlushable(generated);

// @ts-expect-error The generated identify requires the plan's user properties, which the adapter never sends, so AmpliLike declares them optional.
generated.identify("user_42");

// @ts-expect-error Amplitude's Identify takes no null value, so a removed trait is sent as an unset.
new Amplitude.Identify().set("plan", null);

export const events = fromAmpli({
  "Event No Properties": EventNoProperties,
  "Event Object Types": EventObjectTypes,
  "Event With All Properties": EventWithAllProperties,
  "Event With Const Types": EventWithConstTypes,
  "Event With Enum Types": EventWithEnumTypes,
  "Event With Optional Properties": EventWithOptionalProperties,
});

type Events = typeof events;

expectTypeOf<
  EventProperties<Events["Event With All Properties"]>
>().toEqualTypeOf<
  EventWithAllPropertiesProperties & { requiredConst: "some-const-value" }
>();
expectTypeOf<
  EventProperties<Events["Event With Optional Properties"]>
>().toEqualTypeOf<EventWithOptionalPropertiesProperties>();
expectTypeOf<EventProperties<Events["Event With Const Types"]>>().toEqualTypeOf<
  InstanceType<typeof EventWithConstTypes>["event_properties"]
>();
expectTypeOf<EventProperties<Events["Event No Properties"]>>().toEqualTypeOf<
  Record<string, never>
>();

export const trace = new Trace({
  events,
  destinations: {
    product: ampli({ sdk: generated, Identify: Amplitude.Identify, plugin }),
  },
});

expectTypeOf(trace.destination("product").native).toEqualTypeOf<Ampli | null>();

export const wrapperMethod =
  trace.destination("product").native?.eventWithAllProperties;

expectTypeOf(trace.track<"Event Object Types">).parameters.toEqualTypeOf<
  [
    name: "Event Object Types",
    properties: EventObjectTypesProperties,
    options?: TrackOptions<"product">,
  ]
>();
expectTypeOf(trace.track<"Event With All Properties">).parameters.toEqualTypeOf<
  [
    name: "Event With All Properties",
    properties: EventWithAllPropertiesProperties,
    options?: TrackOptions<"product">,
  ]
>();
expectTypeOf(trace.track<"Event With Enum Types">).parameters.toEqualTypeOf<
  [
    name: "Event With Enum Types",
    properties: EventWithEnumTypesProperties,
    options?: TrackOptions<"product">,
  ]
>();
expectTypeOf(
  trace.track<"Event With Optional Properties">,
).parameters.toEqualTypeOf<
  [
    name: "Event With Optional Properties",
    properties?: EventWithOptionalPropertiesProperties | undefined,
    options?: TrackOptions<"product">,
  ]
>();
expectTypeOf(trace.track<"Event No Properties">).parameters.toEqualTypeOf<
  [
    name: "Event No Properties",
    properties?: undefined,
    options?: TrackOptions<"product">,
  ]
>();
expectTypeOf(trace.track<"Event With Const Types">).parameters.toEqualTypeOf<
  [
    name: "Event With Const Types",
    properties?: undefined,
    options?: TrackOptions<"product">,
  ]
>();

trace.track("Event No Properties");
trace.track("Event With Const Types");
trace.track("Event With Optional Properties");
trace.track("Event With Optional Properties", { optionalString: "x" });
trace.track("Event Object Types", {
  requiredObject: {},
  requiredObjectArray: [],
});
trace.track("Event With Enum Types", { "required enum": "required enum 1" });
trace.track("Event With All Properties", {
  requiredArray: ["one"],
  requiredBoolean: true,
  requiredEnum: "Enum1",
  requiredInteger: 5,
  requiredNumber: 2.2,
  requiredString: "value",
});

// @ts-expect-error Required properties cannot be left out.
trace.track("Event Object Types");

// @ts-expect-error A value outside the tracking plan's enum is refused.
trace.track("Event With Enum Types", { "required enum": "not in the plan" });

// @ts-expect-error A class that takes no argument takes no properties.
trace.track("Event No Properties", { requiredString: "value" });

// @ts-expect-error A key the generated properties do not declare is refused.
trace.track("Event With Optional Properties", { optionalStrng: "x" });

// @ts-expect-error An event no generated class declares cannot be tracked.
trace.track("Event Nobody Declared");

trace.track("Event With All Properties", {
  requiredArray: ["one"],
  requiredBoolean: true,
  requiredEnum: "Enum1",
  requiredInteger: 5,
  requiredNumber: 2.2,
  requiredString: "value",
  // @ts-expect-error A constant the generated constructor injects is not caller input.
  requiredConst: "some-const-value",
});

ampli({
  // @ts-expect-error An object that is not a generated Ampli wrapper is refused.
  sdk: { track: () => ({ promise: Promise.resolve() }) },
  Identify: Amplitude.Identify,
  plugin,
});

// @ts-expect-error The plain Amplitude browser SDK belongs to @priemskiyyy/trace-amplitude.
ampli({ sdk: Amplitude, Identify: Amplitude.Identify, plugin });

// @ts-expect-error The Amplitude Node SDK is not a generated browser wrapper.
ampli({ sdk: AmplitudeNode, Identify: AmplitudeNode.Identify, plugin });

// @ts-expect-error The plugin is required: without it an anonymous event can be filed under the next user.
ampli({ sdk: generated, Identify: Amplitude.Identify });

ampli({
  sdk: generated,
  Identify: Amplitude.Identify,
  // @ts-expect-error The plugin comes from identityPlugin(), not from any Amplitude plugin.
  plugin: { name: "other", type: "enrichment" },
});
