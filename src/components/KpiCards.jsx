import {
  formatCurrency,
  formatNumber,
  formatRatio,
  formatPercent,
} from "@/lib/format";

/**
 * Row of KPI cards — the seven headline metrics.
 *
 * Layout is a responsive grid: 1 col mobile, 2 col tablet, 4 col desktop,
 * 7 col ultra-wide. The ROMS card uses the navy panel as a visual anchor
 * since it's the "so what" metric.
 */
export default function KpiCards({ total }) {
  const tiles = [
    {
      label: "Media Spend",
      value: formatCurrency(total.spend),
      tone: "neutral",
      hint: "Meta — Google coming v2",
    },
    {
      label: "Leads",
      value: formatNumber(total.leads),
      tone: "neutral",
    },
    {
      label: "Cost Per Lead",
      value: formatCurrency(total.costPerLead),
      tone: "neutral",
    },
    {
      label: "Referrals",
      value: formatNumber(total.referrals),
      tone: "neutral",
    },
    {
      label: "Cost Per Referral",
      value: formatCurrency(total.costPerReferral),
      tone: "neutral",
    },
    {
      label: "Revenue",
      value: formatCurrency(total.revenue),
      tone: "blue",
      hint: "Referrals × Rev/Referred Lead",
    },
    {
      label: "Return on Media Spend",
      value: formatRatio(total.roms),
      tone: "navy",
      hint: `Inverse: ${formatPercent(total.spendShareOfRevenue)} of revenue`,
    },
  ];

  return (
    <section
      aria-label="Headline metrics"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-3 mb-6"
    >
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} />
      ))}
    </section>
  );
}

function KpiTile({ label, value, hint, tone = "neutral" }) {
  const toneClasses =
    tone === "navy"
      ? "bg-ibn-navy text-white"
      : tone === "blue"
      ? "bg-ibn-blue text-white"
      : "bg-white text-ibn-navy";

  const hintClasses = tone === "neutral" ? "text-neutral-500" : "text-white/70";

  return (
    <div
      className={`${toneClasses} rounded-card shadow-card p-4 flex flex-col gap-1.5`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
        {label}
      </span>
      <span className="text-2xl lg:text-[26px] font-semibold tabular-nums leading-tight">
        {value}
      </span>
      {hint && <span className={`text-[11px] ${hintClasses}`}>{hint}</span>}
    </div>
  );
}
