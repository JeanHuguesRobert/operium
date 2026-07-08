export function formatInvokeHuman(result = {}) {
  if (!result.ok) {
    const parts = [
      `invoke tool failed: ${result.error || "unknown"}`,
      result.message ? `(${result.message})` : null,
    ].filter(Boolean);
    return parts.join(" ");
  }
  const route = result.route?.endpoint || result.route?.routed_via || "unknown";
  const content = String(result.content || "").trim();
  const session = result.session_id ? ` session=${result.session_id}` : "";
  return `invoke ok via ${route}${session}\n${content}`;
}