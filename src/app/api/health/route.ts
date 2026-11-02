import { getToolkit, hasPayPalCredentials, isSandbox } from "@/lib/paypal";
import { CREDENTIAL_ENV, MODEL_ID, PROVIDER, hasModelCredentials } from "@/lib/model";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {
    paypalCredentials: hasPayPalCredentials(),
    paypalEnvironment: isSandbox() ? "sandbox" : "live",
    modelProvider: PROVIDER,
    modelCredentials: hasModelCredentials() ? "ok" : `missing ${CREDENTIAL_ENV[PROVIDER]}`,
    model: MODEL_ID,
  };
  if (hasPayPalCredentials()) {
    try {
      const token = await getToolkit().client.getAccessToken();
      checks.paypalAuth = token ? "ok" : "no token";
    } catch (err) {
      checks.paypalAuth = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  const ok = checks.paypalCredentials === true && checks.modelCredentials === "ok" && checks.paypalAuth === "ok";
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
