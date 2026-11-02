import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";

/**
 * One PayPal Agent Toolkit instance per process. The toolkit owns OAuth
 * (client-credentials, token caching) so every REST call in this app reuses
 * the same access token the agent tools use.
 */
const ENABLED_ACTIONS = {
  invoices: {
    list: true,
    get: true,
    send: true,
    sendReminder: true,
    cancel: true,
    create: true,
    search: true,
    recordPayment: true,
    generateQRC: true,
  },
  transactions: { list: true },
  disputes: { list: true, get: true, create: true }, // "create" = accept_dispute_claim
  orders: { get: true },
  payments: { createRefund: true, getRefunds: true },
  products: { list: true, show: true, create: true },
  subscriptionPlans: { list: true, show: true },
  subscriptions: { show: true, cancel: true, update: true },
  shipment: { create: true, get: true, update: true },
};

let toolkit: PayPalAgentToolkit | null = null;

export function isSandbox(): boolean {
  return (process.env.PAYPAL_ENVIRONMENT ?? "SANDBOX").toUpperCase() !== "PRODUCTION";
}

export function hasPayPalCredentials(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function getToolkit(): PayPalAgentToolkit {
  if (toolkit) return toolkit;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set (see .env.example)");
  }
  toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: ENABLED_ACTIONS,
      context: { sandbox: isSandbox() },
    },
  });
  return toolkit;
}

export class PayPalHttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
  }
}

/** Authenticated call to the PayPal REST API using the toolkit's token. */
export async function paypalFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const tk = getToolkit();
  const token = await tk.client.getAccessToken();
  const base = tk.client.getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    const detail =
      json && typeof json === "object" && "message" in json
        ? String((json as { message: unknown }).message)
        : res.statusText;
    throw new PayPalHttpError(
      res.status,
      json,
      `PayPal ${init.method ?? "GET"} ${path} failed (${res.status}): ${detail}`,
    );
  }
  return json as T;
}
