import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

export default function WebsiteKpiStrip({ totals, showPostcodeMatch = false }) {
  if (!totals) return null;

  const cards = [
    { label: "Spend", value: formatCurrency(totals.spend) },
    { label: "Clicks", value: formatNumber(totals.clicks) },
    { label: "Leads", value: formatNumber(totals.leads) },
    { label: "Cost / Lead", value: totals.costPerLead == null ? "—" : formatCurrency(totals.costPerLead) },
    {
      label: "Conversion Rate",
      value: totals.conversionRate == null ? "—" : formatPercent(totals.conversionRate, { decimals: 2 }),
      sub: "Leads ÷ Clicks",
      accent: true,
    },
  ];

  if (showPostcodeMatch) {
    cards.push({
      label: "Any-Builder Match",
      value: formatNumber(totals.matchedAny || 0),
      sub: totals.matchRate == null ? "no match data" : `${formatPercent(totals.matchRate, { decimals: 1 })} of leads`,
    });
    cards.push({
      label: "Builder Match",
      value: formatNumber(totals.matchedStrict || 0),
      sub: totals.matchRateStrict == null ? "no match data" : `${formatPercent(totals.matchRateStrict, { decimals: 1 })} in their builder's area`,
    });
  }

  const colMap = { 5: "lg:grid-cols-5", 7: "lg:grid-cols-7" };
  const cols = colMap[cards.length] || "lg:grid-cols-5";

  return (
    <section className={`grid grid-cols-2 sm:grid-cols-3 ${cols} gap-3 mb-6`}>
      {cards.map((c) => (
        <div key={c.label} className={`rounded-card shadow-card p-4 ${c.accent ? "bg-ibn-navy text-white" : "bg-white"}`}>
          <div className={`text-[11px] uppercase tracking-wide mb-1 ${c.accent ? "text-white/70" : "text-neutral-500"}`}>{c.label}</div>
          <div className={`text-xl sm:text-2xl font-semibold tabular-nums leading-tight ${c.accent ? "" : "text-ibn-navy"}`}>{c.value}</div>
          {c.sub ? <div className={`text-[11px] mt-1 ${c.accent ? "text-white/70" : "text-neutral-500"}`}>{c.sub}</div> : null}
        </div>
      ))}
    </section>
  );
}
