"use client";

import { usePanelDialog } from "./use-panel-dialog";
import type { TransactionRow } from "@/lib/data";

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function dateTime(value: string) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : `${new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }).format(parsed)} UTC`;
}

/** Read-only details for one Transaction Search row. Uses the invoice panel's layout and styles. */
export function TransactionDetails({ transaction: t, onClose, onAsk }: {
  transaction: TransactionRow;
  onClose: () => void;
  onAsk: (prompt: string) => void;
}) {
  const { dialogRef, close, handleClose, finishTransition } = usePanelDialog(onClose);

  const customer = t.payerName || t.payerEmail || "Unknown customer";
  const status = t.statusLabel || t.status || "Unknown";
  const ask = (prompt: string) => {
    close(() => onAsk(prompt));
  };

  return (
    <dialog
      ref={dialogRef}
      className="invoice-details"
      aria-labelledby="transaction-details-title"
      onClose={handleClose}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "transform") finishTransition();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
          close();
        }
      }}
    >
      <div className="invoice-details-layout">
        <header className="invoice-details-head">
          <div>
            <div className="muted small">Transaction details</div>
            <h2 id="transaction-details-title">{t.kind || "Transaction"}</h2>
          </div>
          <button className="ghost invoice-details-close" aria-label="Close transaction details" onClick={() => close()}>×</button>
        </header>
        <div className="invoice-details-scroll">
          <div className="invoice-details-status">
            <span className={`invoice-badge status-${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>
          </div>
          <div className="invoice-details-balance">
            <div className="muted small">Gross amount</div>
            <div className="invoice-details-amount">{money(t.amount, t.currency)}</div>
          </div>
          <dl className="invoice-details-facts invoice-details-due">
            <div><dt>Date</dt><dd>{dateTime(t.date)}</dd></div>
          </dl>
          <section className="invoice-details-section" aria-labelledby="transaction-customer-heading">
            <h3 id="transaction-customer-heading">Customer</h3>
            <div className="invoice-details-customer">{customer}</div>
            {t.payerEmail && t.payerEmail !== customer && <div className="muted">{t.payerEmail}</div>}
          </section>
          <section className="invoice-details-section" aria-labelledby="transaction-money-heading">
            <h3 id="transaction-money-heading">Amounts</h3>
            <dl className="invoice-details-facts">
              <div><dt>Gross</dt><dd>{money(t.amount, t.currency)}</dd></div>
              <div><dt>PayPal fee</dt><dd>{money(t.fee, t.currency)}</dd></div>
              <div><dt>Net</dt><dd>{money(t.net, t.currency)}</dd></div>
              <div><dt>Currency</dt><dd>{t.currency || "USD"}</dd></div>
            </dl>
          </section>
          <section className="invoice-details-section" aria-labelledby="transaction-note-heading">
            <h3 id="transaction-note-heading">Subject</h3>
            <p className={t.subject ? "invoice-details-note" : "muted"}>{t.subject || "No subject on this transaction."}</p>
          </section>
          {t.invoiceId && (
            <section className="invoice-details-section" aria-labelledby="transaction-invoice-heading">
              <h3 id="transaction-invoice-heading">Linked invoice</h3>
              <div className="invoice-details-id">{t.invoiceId}</div>
            </section>
          )}
          <section className="invoice-details-section" aria-labelledby="transaction-reference-heading">
            <h3 id="transaction-reference-heading">Reference</h3>
            <dl className="invoice-details-facts">
              <div><dt>Transaction ID</dt><dd className="invoice-details-id">{t.id}</dd></div>
              {t.eventCode && <div><dt>PayPal event code</dt><dd>{t.eventCode}</dd></div>}
            </dl>
          </section>
        </div>
        <footer className="invoice-details-actions">
          <button className="primary" onClick={() => ask(`Review transaction ${t.id}: ${t.kind || "transaction"} of ${money(t.amount, t.currency)} from ${customer} on ${t.date.slice(0, 10)}, status ${status}. Explain what it is, the fee and net amount, and anything that needs attention.`)}>Ask Copilot about this transaction</button>
        </footer>
      </div>
    </dialog>
  );
}
