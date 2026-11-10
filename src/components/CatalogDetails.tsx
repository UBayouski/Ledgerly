"use client";

import { usePanelDialog } from "./use-panel-dialog";
import type { CatalogRow } from "@/lib/data";

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

function label(value: string) {
  if (!value) return "";
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "1 month" -> "every month", "3 month" -> "every 3 months" */
function every(interval: string) {
  const [count, unit] = interval.split(" ");
  if (!unit) return interval;
  return count === "1" ? `every ${unit}` : `every ${count} ${unit}s`;
}

function priceText(row: CatalogRow) {
  if (row.price === null) return "Price not set";
  return `${money(row.price, row.currency)}${row.interval ? ` ${every(row.interval)}` : ""}`;
}

/** Read-only details for a product or a subscription plan. Uses the invoice panel's layout and styles. */
export function CatalogDetails({ item, catalog, onClose, onAsk }: {
  item: CatalogRow;
  catalog: readonly CatalogRow[];
  onClose: () => void;
  onAsk: (prompt: string) => void;
}) {
  const { dialogRef, close, handleClose, finishTransition } = usePanelDialog(onClose);

  const isPlan = item.kind === "plan";
  const product = isPlan ? catalog.find((row) => row.kind === "product" && row.id === item.productId) : undefined;
  const plans = isPlan ? [] : catalog.filter((row) => row.kind === "plan" && row.productId === item.id);
  const name = item.name || (isPlan ? "Subscription plan" : "Product");
  const ask = (prompt: string) => {
    close(() => onAsk(prompt));
  };
  const prompt = isPlan
    ? `Review subscription plan ${item.id} "${name}": ${priceText(item)}, status ${label(item.status).toLowerCase() || "unknown"}${product ? `, for product "${product.name}"` : ""}. Explain how it bills and anything that needs attention. Do not change anything.`
    : `Review product ${item.id} "${name}"${plans.length === 0 ? " (it has no subscription plans)" : plans.length === 1 ? " and its subscription plan" : ` and its ${plans.length} subscription plans`}. Explain what is sold and how it is priced, and anything that needs attention. Do not change anything.`;

  return (
    <dialog
      ref={dialogRef}
      className="invoice-details"
      aria-labelledby="catalog-details-title"
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
            <div className="muted small">{isPlan ? "Subscription plan" : "Product"}</div>
            <h2 id="catalog-details-title">{name}</h2>
          </div>
          <button className="ghost invoice-details-close" aria-label="Close catalog details" onClick={() => close()}>×</button>
        </header>
        <div className="invoice-details-scroll">
          <div className="invoice-details-status">
            <span className="invoice-badge">{isPlan ? "Plan" : "Product"}</span>
            {item.status && <span className={`invoice-badge status-${item.status.toLowerCase()}`}>{label(item.status)}</span>}
          </div>
          {isPlan && (
            <div className="invoice-details-balance">
              <div className="muted small">Price</div>
              <div className="invoice-details-amount">{item.price === null ? "Not set" : money(item.price, item.currency)}</div>
              {item.interval && <div className="muted">{label(every(item.interval))}</div>}
            </div>
          )}
          <section className="invoice-details-section" aria-labelledby="catalog-description-heading">
            <h3 id="catalog-description-heading">Description</h3>
            <p className={item.description ? "invoice-details-note" : "muted"}>{item.description || "No description."}</p>
          </section>
          {isPlan ? (
            <section className="invoice-details-section" aria-labelledby="catalog-product-heading">
              <h3 id="catalog-product-heading">Product</h3>
              {product ? <div className="invoice-details-customer">{product.name}</div> : <p className="muted">Not in the catalog list.</p>}
              {item.productId && <div className="invoice-details-id">{item.productId}</div>}
            </section>
          ) : (
            <section className="invoice-details-section" aria-labelledby="catalog-plans-heading">
              <h3 id="catalog-plans-heading">Subscription plans</h3>
              {plans.length ? (
                <dl className="invoice-details-facts">
                  {plans.map((plan) => <div key={plan.id}><dt>{plan.name}</dt><dd>{priceText(plan)}{plan.status ? ` · ${label(plan.status)}` : ""}</dd></div>)}
                </dl>
              ) : <p className="muted">No subscription plans for this product.</p>}
            </section>
          )}
          <section className="invoice-details-section" aria-labelledby="catalog-reference-heading">
            <h3 id="catalog-reference-heading">Reference</h3>
            <dl className="invoice-details-facts">
              <div><dt>{isPlan ? "Plan ID" : "Product ID"}</dt><dd className="invoice-details-id">{item.id}</dd></div>
              <div><dt>Created</dt><dd>{dateTime(item.created)}</dd></div>
            </dl>
          </section>
        </div>
        <footer className="invoice-details-actions">
          <button className="primary" onClick={() => ask(prompt)}>{isPlan ? "Ask Copilot about this plan" : "Ask Copilot about this product"}</button>
        </footer>
      </div>
    </dialog>
  );
}
