import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const PAGES = [
  { name: "Vue", url: "http://127.0.0.1:4391/" },
  { name: "Solid", url: "http://127.0.0.1:4392/" },
  { name: "Svelte", url: "http://127.0.0.1:4393/" },
];

const DESTINATIONS = [
  "Amplitude",
  "PostHog",
  "Mixpanel",
  "Google Analytics",
  "Segment",
  "Your API",
];

const open = async (page: Page, url: string, width: number) => {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url);
  await expect(
    page.getByRole("banner").getByText("Started", { exact: true }),
  ).toBeVisible();

  return errors;
};

const latestReceipt = (page: Page) =>
  page.getByRole("region", { name: "Latest receipt" });

const addToCart = (page: Page, product: string) =>
  page
    .getByRole("listitem", { name: product })
    .getByRole("button", { name: "Add to cart" })
    .click();

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );

for (const { name, url } of PAGES) {
  test(`${name} checks out and reaches every destination with the same accepted event`, async ({
    page,
  }) => {
    const errors = await open(page, url, 1280);

    await page.getByRole("button", { name: "Accept" }).click();
    await addToCart(page, "Suede Boots");
    await page.getByRole("button", { name: "Check out" }).click();

    const receipt = latestReceipt(page);

    await expect(receipt.getByText("Settled")).toBeVisible();

    for (const destination of DESTINATIONS) {
      await expect(
        receipt.getByRole("listitem", { name: destination }),
      ).toContainText("Submitted");
    }

    expect(errors).toEqual([]);
  });

  test(`${name} gates five destinations behind consent and never its own API`, async ({
    page,
  }) => {
    const errors = await open(page, url, 1280);

    await addToCart(page, "Silk Scarf");
    await page.getByRole("button", { name: "Check out" }).click();

    const receipt = latestReceipt(page);

    await expect(
      receipt.getByRole("listitem", { name: "Amplitude" }),
    ).toContainText("Not routed");
    await expect(
      receipt.getByRole("listitem", { name: "Your API" }),
    ).toContainText("Submitted");
    expect(errors).toEqual([]);
  });

  test(`${name} fits a phone without horizontal scroll`, async ({ page }) => {
    const errors = await open(page, url, 375);

    await expect(page.getByRole("region", { name: "Cart" })).toBeVisible();
    await expect(hasHorizontalScroll(page)).resolves.toBe(false);
    expect(errors).toEqual([]);
  });
}
