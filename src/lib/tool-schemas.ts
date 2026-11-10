import { z } from "zod";

/**
 * Input schemas that replace a toolkit schema with a known bug. In toolkit 1.11.0,
 * accept_dispute_claim checks `note` with the dispute-ID pattern ^[A-Za-z0-9_-]{1,255}$,
 * so any note with a space fails before reaching PayPal. The toolkit's execute does not
 * re-validate, so a corrected schema is enough.
 */
export const SCHEMA_OVERRIDES: Record<string, z.ZodType> = {
  accept_dispute_claim: z.object({
    dispute_id: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/, "Invalid PayPal dispute ID").describe("The PayPal dispute ID, for example PP-R-ABC-12345678"),
    note: z.string().trim().min(1).max(2000).describe("A note to the buyer about why the seller is accepting the claim"),
  }),
};
