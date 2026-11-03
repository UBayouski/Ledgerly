import type { ReminderInvoice } from "@/lib/reminder-preview";
import { reminderInput } from "@/lib/reminder-preview";
import { formatMoney } from "./columns";
import { statusLabel } from "@/lib/invoice-actions";

export function InvoiceFacts({ invoice, total = false, additionalRecipients = [] }: { invoice: ReminderInvoice; total?: boolean; additionalRecipients?: string[] }) {
  const amount = total ? invoice.total : invoice.balance;
  const balance = amount && invoice.currency ? formatMoney(amount, invoice.currency) : "Not provided by PayPal";
  return (
      <dl className="reminder-facts">
        <div><dt>Invoice</dt><dd>{invoice.number || invoice.id}<small>{invoice.number ? invoice.id : ""}</small></dd></div>
        <div><dt>Customer</dt><dd>{invoice.recipients.length ? invoice.recipients.map((recipient, index) => (
          <span className="reminder-recipient" key={index}>{recipient.name && <strong>{recipient.name}</strong>}<span>{recipient.email || "Email not provided by PayPal"}</span></span>
        )) : "Recipients not provided by PayPal"}</dd></div>
        {additionalRecipients.length > 0 && <div><dt>Also notify</dt><dd>{additionalRecipients.join(", ")}</dd></div>}
        <div><dt>{total ? "Invoice total" : "Outstanding"}</dt><dd>{balance}</dd></div>
        {invoice.status && <div><dt>Current status</dt><dd>{statusLabel(invoice.status)}</dd></div>}
      </dl>
  );
}

export function ReminderPreview({ input, invoice }: { input: unknown; invoice: ReminderInvoice }) {
  const reminder = reminderInput(input);
  return (
    <div className="reminder-preview">
      <InvoiceFacts invoice={invoice} additionalRecipients={reminder.additionalRecipients} />
      <div className="reminder-message">
        <div className="reminder-subject"><span>Subject</span><strong>{reminder.subject || "PayPal’s default reminder subject"}</strong></div>
        <div className="reminder-note">{reminder.note || "No custom note. PayPal will use its standard reminder."}</div>
      </div>
      <p className="reminder-caption">This is the subject and custom note submitted to PayPal. PayPal adds its invoice layout and payment link.</p>
    </div>
  );
}
