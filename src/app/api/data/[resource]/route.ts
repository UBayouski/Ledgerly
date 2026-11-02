import { fetchView } from "@/lib/data";
import { hasPayPalCredentials, PayPalHttpError } from "@/lib/paypal";
import { VIEWS, type ViewId } from "@/lib/tools";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ resource: string }> }) {
  const { resource } = await ctx.params;
  if (!(VIEWS as readonly string[]).includes(resource)) {
    return Response.json({ error: `Unknown view '${resource}'` }, { status: 404 });
  }
  if (!hasPayPalCredentials()) {
    return Response.json(
      { error: "PayPal credentials missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.", rows: [] },
      { status: 503 },
    );
  }
  try {
    const rows = await fetchView(resource as ViewId);
    return Response.json({ rows, fetchedAt: new Date().toISOString() });
  } catch (err) {
    const status = err instanceof PayPalHttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    const detail = err instanceof PayPalHttpError ? err.body : undefined;
    console.error(`[data/${resource}]`, message, detail ?? "");
    return Response.json({ error: message, detail, rows: [] }, { status: status >= 400 ? status : 500 });
  }
}
