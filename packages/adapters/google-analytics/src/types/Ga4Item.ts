/**
 * One entry of GA4's ecommerce `items` list: the item fields gtag.js sends
 * under names of its own. Any other field of an item is a custom item
 * parameter.
 *
 * @example
 * ```ts
 * const item: Ga4Item = { item_id: "sku_1", item_name: "Tee", price: 20, quantity: 1 };
 * ```
 */
export type Ga4Item = {
  item_id?: string;
  item_name?: string;
  item_brand?: string;
  item_category?: string;
  item_category2?: string;
  item_category3?: string;
  item_category4?: string;
  item_category5?: string;
  item_variant?: string;
  price?: string | number;
  quantity?: number;
  index?: number;
  coupon?: string;
  item_list_name?: string;
  item_list_id?: string;
  discount?: string | number;
  affiliation?: string;
  creative_name?: string;
  creative_slot?: string;
  promotion_id?: string;
  promotion_name?: string;
  location_id?: string;
};
