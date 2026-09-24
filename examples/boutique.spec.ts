import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const WIDTHS = [375, 1280];

const DESTINATIONS = [
  "Amplitude",
  "PostHog",
  "Mixpanel",
  "Google Analytics",
  "Segment",
  "Your API",
];

const open = async (page: Page, width: number) => {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("banner").getByText("Started", { exact: true }),
  ).toBeVisible();

  return errors;
};

const latestReceipt = (page: Page) =>
  page.getByRole("region", { name: "Latest receipt" });

const addToCart = (page: Page, product: string) =>
  page
    .getByRole("list", { name: "Products" })
    .getByRole("listitem", { name: product })
    .getByRole("button", { name: "Add to cart" })
    .click();

const checkOut = async (page: Page, action: string) => {
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(latestReceipt(page).getByText(action)).toBeVisible();
  await expect(latestReceipt(page).getByText("Settled")).toBeVisible();
};

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );

for (const width of WIDTHS) {
  test(`checking out settles without errors or horizontal scroll at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors = await open(page, width);

    await expect(
      latestReceipt(page).getByText("Open the storefront"),
    ).toBeVisible();
    await addToCart(page, "Suede Boots");
    await checkOut(page, "Check out 1 item");

    const receipt = latestReceipt(page);

    await expect(
      receipt.getByRole("listitem", { name: "Your API" }),
    ).toContainText("Submitted");
    await expect(
      receipt.getByRole("listitem", { name: "Amplitude" }),
    ).toContainText("Not routed");
    await expect(hasHorizontalScroll(page)).resolves.toBe(false);

    await page.screenshot({
      path: testInfo.outputPath(`boutique-${width}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("with consent granted, checking out reaches every destination with the same accepted event, and the receipt names what Trace removed", async ({
  page,
}) => {
  const errors = await open(page, 1280);

  await page.getByRole("button", { name: "Accept" }).click();
  await addToCart(page, "Suede Boots");
  await checkOut(page, "Check out 1 item");

  const receipt = latestReceipt(page);

  await expect(
    receipt.getByRole("list", { name: "Removed before sending" }),
  ).toContainText("properties.payment.card.token: redacted");

  for (const destination of DESTINATIONS) {
    await expect(
      receipt.getByRole("listitem", { name: destination }),
    ).toContainText("Submitted");
  }

  expect(errors).toEqual([]);
});

test("switching accounts keeps each event under its own account", async ({
  page,
}) => {
  const errors = await open(page, 1280);

  await page.getByRole("button", { name: "Nora Fields" }).click();
  await addToCart(page, "Canvas Tote");
  await checkOut(page, "Check out 1 item");

  await page.getByRole("button", { name: "Isabella Cruz" }).click();

  const receipts = page.getByRole("list", { name: "Receipts" });

  await expect(
    page.getByRole("button", { name: "Isabella Cruz" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(receipts.getByText(/Nora Fields/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("joining a crew is carried to Segment as its one group", async ({
  page,
}) => {
  const errors = await open(page, 1280);

  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("button", { name: "Night Market Crew" }).click();

  await expect(
    page
      .getByRole("list", { name: "Destinations" })
      .getByRole("listitem", { name: "Segment" }),
  ).toContainText("Night Market Crew");
  expect(errors).toEqual([]);
});

test("consent gates the five provider destinations, never your own API", async ({
  page,
}) => {
  const errors = await open(page, 1280);

  await addToCart(page, "Silk Scarf");
  await checkOut(page, "Check out 1 item");

  const receipt = latestReceipt(page);

  await expect(
    receipt.getByRole("listitem", { name: "Mixpanel" }),
  ).toContainText("Not routed");
  await expect(
    receipt.getByRole("listitem", { name: "Mixpanel" }),
  ).toContainText("Held back: consent was not answered yet.");
  await expect(
    receipt.getByRole("listitem", { name: "Your API" }),
  ).toContainText("Submitted");

  await page.getByRole("button", { name: "Accept" }).click();
  await addToCart(page, "Silk Scarf");
  await page.getByRole("button", { name: "Check out" }).click();

  await expect(
    receipt.getByRole("listitem", { name: "Mixpanel" }),
  ).toContainText("Submitted");
  expect(errors).toEqual([]);
});

test("an offline backend fails only its own outcome", async ({ page }) => {
  const errors = await open(page, 1280);

  await page.getByRole("button", { name: "Your API offline" }).click();
  await addToCart(page, "Canvas Tote");
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(latestReceipt(page).getByText("Check out 1 item")).toBeVisible();

  await expect(
    latestReceipt(page).getByRole("listitem", { name: "Your API" }),
  ).toContainText("Failed");
  expect(errors).toEqual([]);
});

test("stalling Segment restarts Trace, and its checkout waits for a retried start", async ({
  page,
}) => {
  const errors = await open(page, 1280);

  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("button", { name: "Segment never loads" }).click();
  await expect(
    page
      .getByRole("list", { name: "Destinations" })
      .getByRole("listitem", { name: "Segment" }),
  ).toContainText("Start failed");

  await addToCart(page, "Silk Scarf");
  await page.getByRole("button", { name: "Check out" }).click();

  const segment = latestReceipt(page).getByRole("listitem", {
    name: "Segment",
  });

  await expect(segment).toContainText("Sending");

  await page.getByRole("button", { name: "Segment never loads" }).click();
  await page.getByRole("button", { name: "Retry start" }).click();

  await expect(segment).toContainText("Submitted");
  expect(errors).toEqual([]);
});

test("the devtools open over the same runtime and list every destination", async ({
  page,
}) => {
  const errors = await open(page, 1280);

  await page.getByRole("button", { name: "Open Trace devtools" }).click();

  const destinations = page
    .getByRole("complementary", { name: "Trace devtools" })
    .getByRole("navigation", { name: "Trace destinations" });

  await expect(destinations).toBeVisible();

  for (const name of [
    "amplitude",
    "posthog",
    "mixpanel",
    "googleAnalytics",
    "segment",
    "backend",
  ]) {
    await expect(destinations).toContainText(name);
  }

  expect(errors).toEqual([]);
});
