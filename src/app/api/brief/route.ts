import { generateObject } from "ai";
import { getModel, providerOptions } from "@/lib/model";
import { fetchDisputes, fetchInvoices, fetchTransactions } from "@/lib/data";
import { hasPayPalCredentials } from "@/lib/paypal";
import { briefSchema } from "@/lib/brief";
import { isCustomerPayment } from "@/lib/revenue";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET() {
  if (!hasPayPalCredentials()) {
    return Response.json({ error: "PayPal credentials missing." }, { status: 503 });
  }
  try {
    const [transactions, invoices, disputes] = await Promise.all([
      fetchTransactions(30).catch(() => []),
      fetchInvoices().catch(() => []),
      fetchDisputes().catch(() => []),
    ]);

    const openStatuses = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING"]);
    const openInvoices = invoices.filter((i) => openStatuses.has(i.status));
    const overdue = openInvoices.filter((i) => i.daysOverdue > 0);
    const openDisputes = disputes.filter((d) => !["RESOLVED", "OTHER"].includes(d.status));
    const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
    const currency = transactions[0]?.currency || invoices[0]?.currency || "USD";

    const metrics = {
      gross30d: sum(transactions.filter(isCustomerPayment).map((t) => t.amount)),
      fees30d: sum(transactions.map((t) => Math.abs(t.fee))),
      refunds30d: sum(transactions.filter((t) => t.kind === "Refund").map((t) => Math.abs(t.amount))),
      openInvoicesTotal: sum(openInvoices.map((i) => i.due || i.amount)),
      overdueInvoicesTotal: sum(overdue.map((i) => i.due || i.amount)),
      openDisputesTotal: sum(openDisputes.map((d) => d.amount)),
      currency,
    };

    const compact = {
      metrics,
      overdueInvoices: overdue.slice(0, 15).map((i) => ({
        id: i.id,
        number: i.number,
        recipient: i.recipientName || i.recipientEmail,
        due: i.due || i.amount,
        daysOverdue: i.daysOverdue,
      })),
      openInvoices: openInvoices.length,
      draftInvoices: invoices.filter((i) => i.status === "DRAFT").length,
      disputes: openDisputes.slice(0, 10).map((d) => ({
        id: d.id,
        status: d.status,
        reason: d.reason,
        amount: d.amount,
        daysToRespond: d.daysToRespond,
        buyer: d.buyer || undefined,
        buyerMessage: d.buyerMessage ? d.buyerMessage.slice(0, 300) : undefined,
      })),
      recentTransactions: transactions.slice(0, 25).map((t) => ({
        id: t.id,
        date: t.date.slice(0, 10),
        kind: t.kind,
        status: t.statusLabel,
        amount: t.amount,
        payer: t.payerName || t.payerEmail,
        customerPayment: isCustomerPayment(t),
      })),
      transactionCount: transactions.length,
    };

    const { object } = await generateObject({
      model: getModel(),
      schema: briefSchema,
      providerOptions,
      system:
        "You write a short morning brief for a small-business owner about their PayPal account. Be specific: name customers, amounts, days overdue, deadlines. Write money the way a bank statement does: $4,200 or $6,728 for USD (symbol, thousands separator, no cents unless the amount is under $100), and 1.250,00 EUR style with the code for other currencies. Never write 4200 USD. Order items by urgency. Give up to six items: every overdue invoice or open dispute that needs action, one item of good news when there is any, and nothing padded. Only transactions with customerPayment true are sales; adjustments, transfers and refunds are not good news about revenue. Never invent records; only reference ids present in the data. If there is nothing urgent, say so and pick a 'good' item. Return metrics exactly as given.",
      prompt: `Today is ${new Date().toISOString().slice(0, 10)}. Account data (JSON):\n${JSON.stringify(compact)}`,
    });

    return Response.json({ brief: object, generatedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[brief]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
