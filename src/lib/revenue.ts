/**
 * Which Transaction Search rows count as revenue. PayPal's T00xx event codes are customer
 * payments; adjustments (T19xx, such as a sandbox's starting balance), bank transfers (T03xx,
 * T04xx), refunds and reversals (T11xx) move money but are not sales.
 */
export function isCustomerPayment(t: { eventCode: string; amount: number; status: string }): boolean {
  return /^T00\d\d$/.test(t.eventCode) && t.amount > 0 && t.status === "S";
}
