import {
  formatCurrency,
  formatNumber,
  formatRatio,
  formatPercent,
  formatDate,
  formatDiffDays,
} from "@/lib/format";

/**
 * Per-builder breakdown table.
 *
 * Columns:
 *   Builder · Job # · Contract Start · Contract End ·
 *   Spend · Leads · CPL · Referrals · CPR · Revenue · ROMS ·
 *   Pacing · 14 Day Diff · All Time Diff
 *
 * Pacing = referrals-since-contract-start ÷ total lead target (contract-level,
 * NOT scoped to the user's selected date range).
 *
 * 14 Day Diff / All Time Diff = days needed to hit the referral target at the
 * current rate, minus days remaining in the contract.
 *   Positive value → behind (will land after contract end at current pace)
 *   Negative value → ahead  (will land before contract end)
 *
 * Scrolls horizontally on narrow viewports with a soft shadow hint so users
 * know there's more to the right. Rows not in the WIP sheet are flagged —
 * useful data-quality signal for Brendon.
 */
export default function BuildersTable({ rows, onSelectJob }) {
  if (!rows.length) {
    return (
      <section className="bg-white rounded-card shadow-card p-6 text-sm text-neutral-500">
        No builder contracts matched the current filters.
      </section>
    );
  }

  return (
    <section className="bg-white rounded-card shadow-card overflow-hidden">
      <header className="px-4 sm:px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ibn-navy">
          Performance by builder contract
        </h2>
        <span className="text-xs text-neutral-500">
          {rows.length} {rows.length === 1 ? "contract" : "contracts"}
        </span>
      </header>

      <div className="overflow-x-auto scroll-shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <th className="px-4 py-2.5 font-semibold">Builder</th>
              <th className="px-4 py-2.5 font-semibold">Job #</th>
              <th className="px-4 py-2.5 font-semibold">Contract Start</th>
              <th className="px-4 py-2.5 font-semibold">Contract End</th>
              <th className="px-4 py-2.5 font-semibold text-right">Spend</th>
              <th className="px-4 py-2.5 font-semibold text-right">Leads</th>
              <th className="px-4 py-2.5 font-semibold text-right">CPL</th>
              <th className="px-4 py-2.5 font-semibold text-right">Referrals</th>
              <th className="px-4 py-2.5 font-semibold text-right">CPR</th>
              <th className="px-4 py-2.5 font-semibold text-right">Revenue</th>
              <th className="px-4 py-2.5 font-semibold text-right">ROMS</th>
              <th className="px-4 py-2.5 font-semibold text-right">Pacing</th>
              <th
                className="px-4 py-2.5 font-semibold text-right"
                title="Days needed at last-14-day rate minus days remaining in contract. Positive = behind, negative = ahead."
              >
                14 Day Diff
              </th>
              <th
                className="px-4 py-2.5 font-semibold text-right"
                title="Days needed at all-time rate (since contract start) minus days remaining in contract. Positive = behind, negative = ahead."
              >
                All Time Diff
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr
                key={r.jobNumber}
                className="hover:bg-neutral-50 cursor-pointer"
                onClick={() => onSelectJob?.(r.jobNumber)}
              >
                <td className="px-4 py-2.5 font-medium text-ibn-navy">
                  {r.builderName}
                  {!r.inWip && (
                    <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-ibn-orange/15 text-ibn-orange text-[10px] font-semibold uppercase">
                      not in WIP
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-neutral-700 tabular-nums">
                  {r.jobNumber}
                </td>
                <td className="px-4 py-2.5 text-neutral-700 tabular-nums">
                  {formatDate(r.contractStartDate)}
                </td>
                <td className="px-4 py-2.5 text-neutral-700 tabular-nums">
                  {formatDate(r.contractEndDate)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCurrency(r.spend)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(r.leads)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCurrency(r.costPerLead)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(r.referrals)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCurrency(r.costPerReferral)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCurrency(r.revenue)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                  {formatRatio(r.roms)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <PacingCell pacing={r.pacing} target={r.totalLeadTarget} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <DiffCell value={r.diff14} targetHit={r.targetHit} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <DiffCell value={r.diffAllTime} targetHit={r.targetHit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Pacing = referrals-since-contract-start ÷ total lead target.
 * Visualised as a mini bar so progress is scannable.
 * Colour steps:
 *   < 40%   → orange (attention)
 *   40–90%  → blue
 *   >= 90%  → navy (on track / ahead)
 */
function PacingCell({ pacing, target }) {
  if (!target) {
    return <span className="text-neutral-400 text-xs">no target</span>;
  }
  const pct = Math.min(Math.max(pacing || 0, 0), 1.5);
  const widthPct = Math.min(pct, 1) * 100;

  const band = pct < 0.4 ? "bg-ibn-orange" : pct < 0.9 ? "bg-ibn-blue" : "bg-ibn-navy";

  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`h-full ${band}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-neutral-700">
        {formatPercent(pacing)}
      </span>
    </div>
  );
}

/**
 * Formats the pacing-diff columns with a colour tint:
 *   positive → orange (behind)
 *   zero or target already hit → navy
 *   negative → blue (ahead)
 *   null → neutral grey em-dash
 */
function DiffCell({ value, targetHit }) {
  if (targetHit) {
    return (
      <span className="text-ibn-navy font-semibold text-xs uppercase tracking-wide">
        target hit
      </span>
    );
  }
  if (value === null || value === undefined) {
    return <span className="text-neutral-400">—</span>;
  }
  const tone =
    value > 0 ? "text-ibn-orange" : value < 0 ? "text-ibn-blue" : "text-ibn-navy";
  return <span className={`${tone} font-medium`}>{formatDiffDays(value)}</span>;
}
