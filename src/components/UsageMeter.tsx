import type { UsageSummary } from "@/types/database";
export function UsageMeter({ usage, compact=false }: { usage: UsageSummary; compact?: boolean }) {
  const pct = Math.min(100, Math.max(0, usage.percentage));
  const warning = pct >= 100 ? "limit" : pct >= 95 ? "critical" : pct >= 80 ? "warning" : "normal";
  return (
    <div className={`usage-meter ${compact ? "compact" : ""} ${warning}`}>
      <div className="usage-meter-head"><span>{usage.used.toLocaleString()} of {usage.limit.toLocaleString()} characters used</span><strong>{Math.round(pct)}%</strong></div>
      <div className="usage-track"><span style={{ width: `${pct}%` }} /></div>
      {!compact && pct >= 80 && <p>{pct >= 100 ? "Monthly limit reached." : pct >= 95 ? "Almost at your monthly limit." : "You have used more than 80% of your allowance."}</p>}
    </div>
  );
}
