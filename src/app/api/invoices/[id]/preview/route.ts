import { hasPayPalCredentials, paypalFetch } from "@/lib/paypal";
import { reminderInvoice } from "@/lib/reminder-preview";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,127}$/.test(id)) return Response.json({ error: "Invalid invoice reference." }, { status: 400 });
  if (!hasPayPalCredentials()) return Response.json({ error: "PayPal is unavailable." }, { status: 503 });
  try {
    const invoice = reminderInvoice(await paypalFetch(`/v2/invoicing/invoices/${encodeURIComponent(id)}`));
    if (invoice.id !== id) throw new Error("Invoice reference did not match");
    return Response.json({ invoice }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not load the invoice for review." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
