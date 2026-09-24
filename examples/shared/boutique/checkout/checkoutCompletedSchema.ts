import { z } from "zod";

/** What a completed checkout carries: the order, its payment and a gift note long enough to be truncated. */
export const checkoutCompletedSchema = z.object({
  cart: z.object({ id: z.string() }),
  total: z.number(),
  currency: z.string(),
  items: z.array(
    z.object({
      productId: z.enum(["scarf", "boots", "tote"]),
      quantity: z.number(),
    }),
  ),
  payment: z.object({
    method: z.enum(["card", "paypal"]),
    card: z.object({ token: z.string(), last4: z.string() }).optional(),
  }),
  giftNote: z.string(),
});
