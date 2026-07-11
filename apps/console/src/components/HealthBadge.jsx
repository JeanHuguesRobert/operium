import { healthTone } from "../lib/ops-api.js";

const TONE_CLASS = {
  ok: "bg-ops-ok/20 text-ops-ok",
  warn: "bg-ops-warn/20 text-ops-warn",
  bad: "bg-ops-bad/20 text-ops-bad",
  muted: "bg-ops-border text-ops-muted",
};

export function HealthBadge({ score, label = "health" }) {
  const tone = healthTone(score);
  const text = Number.isFinite(Number(score)) ? String(score) : "?";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}>
      {label} {text}
    </span>
  );
}