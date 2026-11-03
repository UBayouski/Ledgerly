"use client";

import { useEffect, useRef } from "react";
import type { InvoiceRow } from "@/lib/data";
import { isOpenInvoiceStatus } from "./grid-context";

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function date(value: string) {
  if (!value) return "Not set";
  // Invoice dates are calendar dates, so avoid shifting them into another timezone.
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).format(parsed);
}

export function InvoiceDetails({ invoice, onClose, onAsk }: {
  invoice: InvoiceRow;
  onClose: () => void;
  onAsk: (prompt: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  const open = isOpenInvoiceStatus(invoice.status);
  const overdue = open && invoice.daysOverdue > 0;
  const canRemind = open && invoice.due > 0;
  const status = invoice.status.replace(/_/g, " ").toLowerCase();
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const customer = invoice.recipientName || invoice.recipientEmail || "Unknown customer";
  const reference = `invoice ${invoice.number || invoice.id} for ${customer} (invoice ID: ${invoice.id})`;
  const balance = open ? invoice.due : 0;
  const ask = (prompt: string) => {
    dialogRef.current?.close();
    onAsk(prompt);
  };

  return (
    <dialog
      ref={dialogRef}
      className="invoice-details"
      aria-labelledby="invoice-details-title"
      onClose={() => { if (!dialogRef.current?.open) onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
          event.currentTarget.close();
        }
      }}
    >
      <div className="invoice-details-layout">
        <header className="invoice-details-head">
          <div>
            <div className="muted small">Invoice details</div>
            <h2 id="invoice-details-title">Invoice {invoice.number || invoice.id}</h2>
          </div>
          <button className="ghost invoice-details-close" aria-label="Close invoice details" onClick={() => dialogRef.current?.close()}>×</button>
        </header>
        <div className="invoice-details-scroll">
          <div className="invoice-details-status">
            <span className={`invoice-badge status-${overdue ? "overdue" : invoice.status.toLowerCase()}`}>{overdue ? "Overdue" : statusLabel}</span>
            {overdue && <span className="err small">{invoice.daysOverdue} {invoice.daysOverdue === 1 ? "day" : "days"} past due</span>}
          </div>
          <div className="invoice-details-balance">
            <div className="muted small">Outstanding balance</div>
            <div className="invoice-details-amount">{money(balance, invoice.currency)}</div>
            {invoice.status === "DRAFT" && <p className="muted small">This draft has not been sent. No payment is owed yet.</p>}
            {invoice.status === "CANCELLED" && <p className="muted small">This invoice is cancelled. No payment is outstanding.</p>}
          </div>
          <dl className="invoice-details-facts invoice-details-due">
            <div><dt>Due date</dt><dd>{date(invoice.dueDate)}</dd></div>
          </dl>
          <section className="invoice-details-section" aria-labelledby="invoice-customer-heading">
            <h3 id="invoice-customer-heading">Customer</h3>
            <div className="invoice-details-customer">{customer}</div>
            {invoice.recipientEmail && invoice.recipientEmail !== customer && <div className="muted">{invoice.recipientEmail}</div>}
          </section>
          <section className="invoice-details-section" aria-labelledby="invoice-payment-heading">
            <h3 id="invoice-payment-heading">Payment summary</h3>
            <dl className="invoice-details-facts">
              <div><dt>Invoice total</dt><dd>{money(invoice.amount, invoice.currency)}</dd></div>
              <div><dt>Paid to date</dt><dd>{money(invoice.paid, invoice.currency)}</dd></div>
              <div><dt>Currency</dt><dd>{invoice.currency || "USD"}</dd></div>
            </dl>
          </section>
          <section className="invoice-details-section" aria-labelledby="invoice-date-heading">
            <h3 id="invoice-date-heading">Dates &amp; status</h3>
            <dl className="invoice-details-facts">
              <div><dt>Issued</dt><dd>{date(invoice.invoiceDate)}</dd></div>
              <div><dt>PayPal status</dt><dd>{statusLabel}</dd></div>
            </dl>
          </section>
          <section className="invoice-details-section" aria-labelledby="invoice-note-heading">
            <h3 id="invoice-note-heading">Notes</h3>
            <p className={invoice.note ? "invoice-details-note" : "muted"}>{invoice.note || "No notes on this invoice."}</p>
          </section>
          <section className="invoice-details-section" aria-labelledby="invoice-reference-heading">
            <h3 id="invoice-reference-heading">Reference</h3>
            <div className="invoice-details-id">{invoice.id}</div>
          </section>
        </div>
        <footer className="invoice-details-actions">
          <button className="primary" onClick={() => ask(`Review ${reference}. Explain its payment status, balance, and what needs attention.`)}>Ask Copilot about this invoice</button>
          {canRemind && <button className="ghost" onClick={() => ask(`Draft a payment reminder for ${reference}, with ${money(invoice.due, invoice.currency)} outstanding. Show me the reminder for approval before sending it.`)}>Draft reminder in Copilot</button>}
        </footer>
      </div>
    </dialog>
  );
}
