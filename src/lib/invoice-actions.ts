const actions = {
  send_invoice_reminder: { title: "Invoice reminder", button: "Send reminder", pending: "Sending…", success: "Sent", result: "PayPal accepted the reminder request.", description: "Send a payment reminder for this invoice." },
  send_invoice: { title: "Send invoice", button: "Send invoice", pending: "Sending…", success: "Sent", result: "PayPal accepted the invoice send request.", description: "Issue this invoice through PayPal with the notification settings below." },
  cancel_sent_invoice: { title: "Cancel invoice", button: "Cancel invoice", pending: "Cancelling invoice…", success: "Invoice cancelled", result: "PayPal confirmed the invoice cancellation.", description: "Cancel this invoice in PayPal. This does not refund payments already received." },
  record_payment_for_invoice: { title: "Record payment", button: "Record payment", pending: "Recording…", success: "Recorded", result: "PayPal recorded the payment against this invoice.", description: "Record a payment already received. This does not charge the customer." },
  delete_invoice: { title: "Delete invoice", button: "Delete invoice", pending: "Deleting…", success: "Deleted", result: "PayPal confirmed the invoice deletion.", description: "Permanently delete this draft or scheduled invoice from PayPal." },
} as const;

export function invoiceAction(name: string) {
  return Object.hasOwn(actions, name) ? actions[name as keyof typeof actions] : undefined;
}

/** Human label for a PayPal invoice status: MARKED_AS_PAID -> "Marked as paid". */
export function statusLabel(status: string) {
  const s = status.replace(/_/g, " ").toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

const PAID = new Set(["PAID", "MARKED_AS_PAID", "PARTIALLY_PAID", "MARKED_AS_REFUNDED", "REFUNDED", "PARTIALLY_REFUNDED"]);

/**
 * Why PayPal would refuse this action for an invoice in this status, or
 * undefined when it is allowed. Mirrors PayPal's Invoicing v2 rules so the
 * user is not asked to approve something that will fail.
 */
export function blockedReason(name: string, status: string): string | undefined {
  if (!status) return undefined;
  const label = statusLabel(status).toLowerCase();
  switch (name) {
    case "cancel_sent_invoice":
      if (PAID.has(status)) return "PayPal does not allow cancelling a paid or partially paid invoice.";
      if (status === "CANCELLED") return "This invoice is already cancelled.";
      if (status === "DRAFT") return "Drafts cannot be cancelled. Delete the draft instead.";
      return undefined;
    case "send_invoice":
      if (status === "DRAFT" || status === "SCHEDULED") return undefined;
      return `This invoice has already been sent (status: ${label}).`;
    case "send_invoice_reminder":
      if (status === "DRAFT" || status === "SCHEDULED") return "Reminders can only be sent for invoices that have been sent.";
      if (PAID.has(status) || status === "CANCELLED") return `No reminder is needed: this invoice is ${label}.`;
      return undefined;
    case "delete_invoice":
      if (status === "DRAFT" || status === "SCHEDULED") return undefined;
      return "Only draft or scheduled invoices can be deleted. Cancel a sent invoice instead.";
    case "record_payment_for_invoice":
      if (status === "DRAFT" || status === "SCHEDULED") return "Payments can only be recorded against an invoice that has been sent.";
      if (status === "CANCELLED") return "This invoice is cancelled; a payment cannot be recorded against it.";
      if (status === "PAID" || status === "MARKED_AS_PAID") return "This invoice is already fully paid.";
      return undefined;
    default:
      return undefined;
  }
}

export function requiresInvoiceRecipient(name: string, sendToRecipient: boolean | undefined) {
  return name === "send_invoice_reminder" || ((name === "send_invoice" || name === "cancel_sent_invoice") && sendToRecipient !== false);
}
