/** "The requested action could not be performed, ...: Cannot cancel a paid invoice." -> "Cannot cancel a paid invoice." */
export function cleanPayPalError(text: string): string {
  return text.replace(/^The requested action could not be performed[^:]*:\s*/i, "").trim();
}

/** The toolkit serializes failures instead of throwing; surface them as failed tool calls. */
export function parseToolResult(raw: unknown): unknown {
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return raw; }
  }
  if (parsed && typeof parsed === "object") {
    const result = parsed as Record<string, unknown>;
    if (result.ok === false || result.success === false || result.error) {
      const error = result.error;
      const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : typeof result.message === "string" ? result.message : "PayPal could not complete this action.";
      throw new Error(cleanPayPalError(message));
    }
  }
  return parsed;
}
