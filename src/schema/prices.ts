import { z } from "zod";

/**
 * Operator-maintained USD list prices for one model, as written in
 * `.harness/prices.yaml`. The harness never ships or invents a price: every
 * number here is operator-supplied, and `source` records where it came from.
 */
export const OperatorPriceEntrySchema = z.object({
  input_usd_per_million: z.number().finite().nonnegative(),
  output_usd_per_million: z.number().finite().nonnegative(),
  cache_read_usd_per_million: z.number().finite().nonnegative(),
  cache_write_usd_per_million: z.number().finite().nonnegative(),
  /** Where these numbers came from (provider price page, contract, ...). */
  source: z.string().min(1),
}).strict();
export type OperatorPriceEntry = z.infer<typeof OperatorPriceEntrySchema>;

export const OperatorPriceTableSchema = z.object({
  schema_version: z.literal("uh.prices.v0"),
  models: z.record(z.string().min(1), OperatorPriceEntrySchema),
}).strict();
export type OperatorPriceTableDocument = z.infer<typeof OperatorPriceTableSchema>;
