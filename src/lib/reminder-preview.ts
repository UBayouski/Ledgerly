export type ReminderInvoice = {
  id: string;
  number: string;
  recipients: { name: string; email: string }[];
  balance: string;
  currency: string;
  total: string;
  status: string;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

/** Keep the approval preview tied to PayPal's invoice, rather than model-written customer details. */
export function reminderInvoice(raw: unknown): ReminderInvoice {
  const invoice = record(raw);
  const due = record(invoice.due_amount);
  const amount = record(invoice.amount);
  return {
    id: text(invoice.id),
    number: text(record(invoice.detail).invoice_number),
    recipients: (Array.isArray(invoice.primary_recipients) ? invoice.primary_recipients : []).map((recipient) => {
      const billing = record(record(recipient).billing_info);
      const name = record(billing.name);
      return {
        name: [text(name.given_name), text(name.surname)].filter(Boolean).join(" ") || text(billing.business_name),
        email: text(billing.email_address),
      };
    }),
    balance: text(due.value),
    currency: text(due.currency_code) || text(amount.currency_code),
    total: text(amount.value),
    status: text(invoice.status),
  };
}

export function reminderInput(input: unknown) {
  const value = record(input);
  return {
    invoiceId: text(value.invoice_id),
    subject: text(value.subject),
    note: text(value.note),
    additionalRecipients: (Array.isArray(value.additional_recipients) ? value.additional_recipients : []).filter((email): email is string => typeof email === "string"),
    sendToRecipient: typeof value.send_to_recipient === "boolean" ? value.send_to_recipient : undefined,
    payment: {
      amount: text(record(value.amount).value),
      currency: text(record(value.amount).currency_code),
      method: text(value.method),
      date: text(value.payment_date),
      dateTime: text(value.payment_date_time),
      id: text(value.payment_id),
      shipping: value.shipping_info,
    },
  };
}
