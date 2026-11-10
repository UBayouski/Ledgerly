"use client";

import { usePanelDialog } from "./use-panel-dialog";
import type { DisputeRow } from "@/lib/data";

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

/** "WAITING_FOR_SELLER_RESPONSE" -> "Waiting for seller response" */
function label(value: string) {
  if (!value) return "";
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Read-only details for one dispute. Uses the invoice panel's layout and styles. */
export function DisputeDetails({ dispute: d, onClose, onAsk }: {
  dispute: DisputeRow;
  onClose: () => void;
  onAsk: (prompt: string) => void;
}) {
  const { dialogRef, close, handleClose, finishTransition } = usePanelDialog(onClose);

  const resolved = d.status === "RESOLVED";
  const awaitingSeller = !resolved && Boolean(d.responseDue);
  const urgent = awaitingSeller && d.daysToRespond <= 3;
  const buyer = d.buyer || "Unknown buyer";
  const ask = (prompt: string) => {
    close(() => onAsk(prompt));
  };
  const prompt = resolved
    ? `Review dispute ${d.id} from ${buyer} (${label(d.reason).toLowerCase()}, ${money(d.amount, d.currency)}), now resolved. Open the case details and explain the outcome.`
    : `Review dispute ${d.id} from ${buyer}: ${label(d.reason).toLowerCase()}, ${money(d.amount, d.currency)}, status ${label(d.status).toLowerCase()}${d.responseDue ? `, respond by ${d.responseDue.slice(0, 10)}` : ""}. Open the case details, explain what the buyer is claiming, and suggest how to respond. Do not submit anything.`;

  return (
    <dialog
      ref={dialogRef}
      className="invoice-details"
      aria-labelledby="dispute-details-title"
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
            <div className="muted small">Dispute details</div>
            <h2 id="dispute-details-title">{d.id || "Dispute"}</h2>
          </div>
          <button className="ghost invoice-details-close" aria-label="Close dispute details" onClick={() => close()}>×</button>
        </header>
        <div className="invoice-details-scroll">
          <div className="invoice-details-status">
            <span className={`invoice-badge status-${urgent ? "overdue" : d.status.toLowerCase()}`}>{label(d.status) || "Unknown"}</span>
            {d.stage && <span className="invoice-badge">{label(d.stage)}</span>}
          </div>
          <div className="invoice-details-balance">
            <div className="muted small">Disputed amount</div>
            <div className="invoice-details-amount">{money(d.amount, d.currency)}</div>
          </div>
          <dl className="invoice-details-facts invoice-details-due">
            <div><dt>Respond by</dt><dd>{d.responseDue && !resolved ? dateTime(d.responseDue) : "No response due"}</dd></div>
            {awaitingSeller && <div><dt>Days left</dt><dd className={urgent ? "status-overdue" : undefined}>{d.daysToRespond}</dd></div>}
          </dl>
          <section className="invoice-details-section" aria-labelledby="dispute-buyer-heading">
            <h3 id="dispute-buyer-heading">Buyer</h3>
            <div className="invoice-details-customer">{buyer}</div>
          </section>
          <section className="invoice-details-section" aria-labelledby="dispute-claim-heading">
            <h3 id="dispute-claim-heading">Claim</h3>
            <dl className="invoice-details-facts">
              <div><dt>Reason</dt><dd>{label(d.reason) || "Not given"}</dd></div>
              {d.outcome && <div><dt>Outcome</dt><dd>{label(d.outcome)}</dd></div>}
            </dl>
          </section>
          <section className="invoice-details-section" aria-labelledby="dispute-message-heading">
            <h3 id="dispute-message-heading">Buyer&apos;s message</h3>
            <p className={d.buyerMessage ? "invoice-details-note" : "muted"}>{d.buyerMessage || "No message from the buyer."}</p>
          </section>
          <section className="invoice-details-section" aria-labelledby="dispute-reference-heading">
            <h3 id="dispute-reference-heading">Reference</h3>
            <dl className="invoice-details-facts">
              <div><dt>Case ID</dt><dd className="invoice-details-id">{d.id}</dd></div>
              {d.transactionId && <div><dt>Transaction ID</dt><dd className="invoice-details-id">{d.transactionId}</dd></div>}
              <div><dt>Opened</dt><dd>{dateTime(d.created)}</dd></div>
              {d.channel && <div><dt>Channel</dt><dd>{label(d.channel)}</dd></div>}
            </dl>
          </section>
        </div>
        <footer className="invoice-details-actions">
          <button className="primary" onClick={() => ask(prompt)}>{resolved ? "Ask Copilot about this dispute" : "Plan a response with Copilot"}</button>
        </footer>
      </div>
    </dialog>
  );
}
