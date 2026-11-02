/**
 * Seed a PayPal sandbox business account with demo data for Ledgerly.
 *
 *   node --env-file=.env.local scripts/seed.ts
 *
 * Creates: 2 catalog products, 1 subscription plan, 6 invoices (sent, some
 * overdue, one paid, one draft) and tries to complete two card orders so the
 * Transactions view has rows. Idempotency is not attempted: run it once.
 * Everything uses the free sandbox; no real money moves.
 */

const BASE = (process.env.PAYPAL_ENVIRONMENT ?? "SANDBOX").toUpperCase() === "PRODUCTION"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

if (BASE.includes("api-m.paypal.com")) {
  console.error("Refusing to seed a LIVE account. Set PAYPAL_ENVIRONMENT=SANDBOX.");
  process.exit(1);
}

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
if (!id || !secret) {
  console.error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (e.g. in .env.local and run with --env-file).");
  process.exit(1);
}

async function token(): Promise<string> {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`oauth failed ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

let TOKEN = "";
async function pp<T = unknown>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `ledgerly-seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 600)}`);
  return json as T;
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const CUSTOMERS = [
  { given: "Maya", surname: "Chen", email: "maya.chen@example.com", biz: "Chen Architecture Studio" },
  { given: "Diego", surname: "Alvarez", email: "diego.alvarez@example.com", biz: "Alvarez Catering" },
  { given: "Priya", surname: "Natarajan", email: "priya.n@example.com", biz: "Natarajan Dental" },
  { given: "Tom", surname: "Okafor", email: "tom.okafor@example.com", biz: "Okafor Fitness" },
  { given: "Lena", surname: "Fischer", email: "lena.fischer@example.com", biz: "Fischer Photography" },
  { given: "Sam", surname: "Reyes", email: "sam.reyes@example.com", biz: "Reyes Landscaping" },
];

type InvoiceSpec = {
  c: (typeof CUSTOMERS)[number];
  items: { name: string; qty: number; price: number }[];
  issued: number; // days ago
  dueIn: number; // days after issue
  send: boolean;
  pay?: boolean;
  note?: string;
};

const INVOICES: InvoiceSpec[] = [
  { c: CUSTOMERS[0], items: [{ name: "Brand identity package", qty: 1, price: 2400 }, { name: "Stationery design", qty: 1, price: 450 }], issued: 45, dueIn: 14, send: true, note: "Phase 1 deliverables" },
  { c: CUSTOMERS[1], items: [{ name: "Event photography (6h)", qty: 1, price: 900 }], issued: 32, dueIn: 15, send: true },
  { c: CUSTOMERS[2], items: [{ name: "Website maintenance", qty: 3, price: 150 }], issued: 20, dueIn: 10, send: true },
  { c: CUSTOMERS[3], items: [{ name: "Social media kit", qty: 1, price: 650 }], issued: 12, dueIn: 30, send: true },
  { c: CUSTOMERS[4], items: [{ name: "Logo refresh", qty: 1, price: 800 }], issued: 25, dueIn: 7, send: true, pay: true },
  { c: CUSTOMERS[5], items: [{ name: "Spring campaign landing page", qty: 1, price: 1200 }], issued: 1, dueIn: 30, send: false },
];

async function main() {
  TOKEN = await token();
  console.log(`Authenticated against ${BASE}`);

  // Catalog
  const prodA = await pp<{ id: string }>("POST", "/v1/catalogs/products", {
    name: "Studio Retainer",
    description: "Monthly design retainer: 10 hours of design work",
    type: "SERVICE",
    category: "SOFTWARE",
  });
  const prodB = await pp<{ id: string }>("POST", "/v1/catalogs/products", {
    name: "Brand Guidelines PDF",
    description: "Downloadable brand guidelines template",
    type: "DIGITAL",
    category: "SOFTWARE",
  });
  console.log("products:", prodA.id, prodB.id);

  const plan = await pp<{ id: string }>("POST", "/v1/billing/plans", {
    product_id: prodA.id,
    name: "Studio Retainer, monthly",
    description: "10 design hours per month",
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: "1500.00", currency_code: "USD" } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
  });
  console.log("plan:", plan.id);

  // Invoices
  for (const spec of INVOICES) {
    const invoiceDate = day(-spec.issued);
    const dueDate = day(-spec.issued + spec.dueIn);
    const inv = await pp<{ href: string }>("POST", "/v2/invoicing/invoices", {
      detail: {
        currency_code: "USD",
        invoice_date: invoiceDate,
        payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: dueDate },
        note: spec.note ?? "Thank you for your business.",
        terms_and_conditions: "Payment due by the date shown. Late payments accrue 1.5% monthly.",
      },
      invoicer: { business_name: "Northwind Studio", email_address: process.env.SEED_INVOICER_EMAIL || undefined },
      primary_recipients: [
        {
          billing_info: {
            name: { given_name: spec.c.given, surname: spec.c.surname },
            business_name: spec.c.biz,
            email_address: spec.c.email,
          },
        },
      ],
      items: spec.items.map((it) => ({
        name: it.name,
        quantity: String(it.qty),
        unit_amount: { currency_code: "USD", value: it.price.toFixed(2) },
        unit_of_measure: "QUANTITY",
      })),
      configuration: { allow_tip: false, tax_calculated_after_discount: true, tax_inclusive: false },
    });
    const invoiceId = inv.href.split("/").pop()!;
    let status = "DRAFT";
    if (spec.send) {
      await pp("POST", `/v2/invoicing/invoices/${invoiceId}/send`, { send_to_recipient: true, send_to_invoicer: false });
      status = "SENT";
    }
    if (spec.pay) {
      const total = spec.items.reduce((a, b) => a + b.qty * b.price, 0);
      await pp("POST", `/v2/invoicing/invoices/${invoiceId}/payments`, {
        method: "BANK_TRANSFER",
        payment_date: day(-spec.issued + 3),
        amount: { currency_code: "USD", value: total.toFixed(2) },
        note: "Paid by wire",
      });
      status = "MARKED_AS_PAID";
    }
    console.log(`invoice ${invoiceId} ${status} ${spec.c.biz} due ${dueDate}`);
  }

  // Transactions: try two direct card payments (needs Advanced Card Payments enabled on the sandbox app).
  const cards = [
    { amount: "129.00", desc: "Brand Guidelines PDF", name: "Lena Fischer", number: "4111111111111111" },
    { amount: "1500.00", desc: "Studio Retainer, March", name: "Maya Chen", number: "5555555555554444" },
  ];
  for (const c of cards) {
    try {
      const order = await pp<{ id: string; status: string }>("POST", "/v2/checkout/orders", {
        intent: "CAPTURE",
        purchase_units: [{ description: c.desc, amount: { currency_code: "USD", value: c.amount } }],
        payment_source: {
          card: { number: c.number, expiry: "2030-12", name: c.name, security_code: "123" },
        },
      });
      console.log(`card order ${order.id} ${order.status} ${c.amount} USD (${c.desc})`);
    } catch (e) {
      console.warn(`card order skipped: ${(e as Error).message.slice(0, 300)}`);
      console.warn("Tip: enable 'Advanced Credit and Debit Card Payments' on your sandbox app, or make a sandbox purchase via Errandly/checkout instead.");
    }
  }

  console.log("\nDone. Transaction Search can lag a few minutes behind new payments.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
