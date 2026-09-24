/**
 * One entry of GA4's ecommerce `items` list, typed as React Native Firebase
 * types its `Item`, without the index signature it keeps for custom parameters.
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
  price?: number;
  quantity?: number;
  index?: number;
  coupon?: string;
  item_list_name?: string;
  item_list_id?: string;
  discount?: number;
  affiliation?: string;
  creative_name?: string;
  creative_slot?: string;
  promotion_id?: string;
  promotion_name?: string;
  location_id?: string;
};
