import type { ReminderInvoice } from "@/lib/reminder-preview";
import { reminderInput } from "@/lib/reminder-preview";
import { invoiceAction } from "@/lib/invoice-actions";
import { InvoiceFacts, ReminderPreview } from "./ReminderPreview";
import { formatMoney } from "./columns";

export function InvoiceActionPreview({ name, input, invoice }: { name: string; input: unknown; invoice: ReminderInvoice }) {
  if (name === "send_invoice_reminder") return <ReminderPreview input={input} invoice={invoice} />;
  const proposed = reminderInput(input);
  const payment = name === "record_payment_for_invoice";
  const notifies = name === "send_invoice" || name === "cancel_sent_invoice";
  return (
    <div className="reminder-preview">
      <p className="invoice-action-summary">{invoiceAction(name)?.description}</p>
      <InvoiceFacts invoice={invoice} total={name === "send_invoice" || name === "delete_invoice"} additionalRecipients={notifies ? proposed.additionalRecipients : []} />
      {notifies && <dl className="reminder-facts"><div><dt>Notify customer</dt><dd>{proposed.sendToRecipient === undefined ? "PayPal default (not specified in request)" : proposed.sendToRecipient ? "Yes, notify the invoice recipients" : "No, do not notify the invoice recipients"}</dd></div></dl>}
      {payment && (
        <div className="reminder-message">
          <h4 className="invoice-action-heading">Payment to record</h4>
          <dl className="reminder-facts">
            <div><dt>Amount</dt><dd>{proposed.payment.amount && proposed.payment.currency ? formatMoney(proposed.payment.amount, proposed.payment.currency) : "Not specified in request"}</dd></div>
            <div><dt>Method</dt><dd>{proposed.payment.method.replace(/_/g, " ").toLowerCase() || "Not specified in request"}</dd></div>
            <div><dt>Payment date</dt><dd>{proposed.payment.date || "Not specified in request"}</dd></div>
            {proposed.payment.dateTime && <div><dt>Date and time</dt><dd>{proposed.payment.dateTime}</dd></div>}
            {proposed.payment.id && <div><dt>Payment ID</dt><dd>{proposed.payment.id}</dd></div>}
          </dl>
          {proposed.payment.shipping !== undefined && <div><h4 className="invoice-action-heading">Shipping information</h4><pre className="invoice-action-shipping">{JSON.stringify(proposed.payment.shipping, null, 2)}</pre></div>}
        </div>
      )}
      {proposed.note && <div className="reminder-message"><h4 className="invoice-action-heading">{payment ? "Payment note" : "Note to customer"}</h4><div className="reminder-note">{proposed.note}</div></div>}
    </div>
  );
}
