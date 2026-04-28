import { formatCurrency, formatNumber } from "@/lib/format";
import {
  AD_TYPE_LEAD_ADS,
  AD_TYPE_WEBSITE,
  adTypeLabel,
} from "@/lib/adType";

/**
 * Side-by-side comparison of Meta Lead Ads vs Website campaigns.
 *
 * Three KPIs per side (Spend, Leads, Cost Per Lead) plus a share-of-total
 * bar so the relative weight of each strategy reads at a glance.
 *
 * Brand palette is enforced — Lead Ads = orange, Website = blue, navy
 * for typography. No off-brand colours.
 */
export default function AdTypeComparison({ totals }) {
  if (!totals) return null;
  const { leadAds, website, all } = totals;

  const cards = [
    { adType: AD_TYPE_LEAD_ADS, group: leadAds, accent: "orange" },
    { adType: AD_TYPE_WEBSITE, group: website, accent: "blue" },
  ];

  return (
    <section className="mb-6">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ibn-navy">
          Top-of-funnel comparison
        </h2>
        <span className="text-xs text-neutral-500">
          {formatNumber(all?.campaignCount || 0)} campaign
          {(all?.campaignCount || 0) === 1 ? "" : "s"} · {formatCurrency(all?.spend || 0)} total spend
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map(({ adType, group, accent }) => (
          <ComparisonCard
            key={adType}
            adType={adType}
            group={group}
            accent={accent}
            all={all}
          />
        ))}
      </div>

      <ShareBars leadAds={leadAds} website={website} all={all} />
    </section>
  );
}

function ComparisonCard({ adType, group, accent, all }) {
  // Branded accent — orange for Lead Ads, blue for Website.
  const accentClasses =
    accent === "orange"
      ? {
          stripe: "bg-ibn-orange",
          chip: "bg-ibn-orange/10 text-ibn-orange",
        }
      : {
          stripe: "bg-ibn-blue",
          chip: "bg-ibn-blue/10 text-ibn-blue",
        };

  const safeGroup = group || { spend: 0, leads: 0, costPerLead: null, campaignCount: 0 };
  const spendShare =
    all && all.spend > 0 ? safeGroup.spend / all.spend : 0;
  const leadsShare =
    all && all.leads > 0 ? safeGroup.leads / all.leads : 0;

  return (
    <article className="bg-white rounded-card shadow-card overflow-hidden">
      <div className={`h-1 ${accentClasses.stripe}`} aria-hidden />
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${accentClasses.chip}`}
          >
            {adTypeLabel(adType)}
          </span>
          <span className="text-xs text-neutral-500">
            {formatNumber(safeGroup.campaignCount)} campaign
            {safeGroup.campaignCount === 1 ? "" : "s"}
          </span>
        </div>

        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Spend" value={formatCurrency(safeGroup.spend)} sub={percent(spendShare) + " of total"} />
          <Stat label="Leads" value={formatNumber(safeGroup.leads)} sub={percent(leadsShare) + " of total"} />
          <Stat
            label="Cost / Lead"
            value={
              safeGroup.costPerLead === null
                ? "—"
                : formatCurrency(safeGroup.costPerLead)
            }
            sub={
              safeGroup.leads > 0
                ? `${formatNumber(safeGroup.leads)} leads`
                : "no leads"
            }
          />
        </dl>
      </div>
    </article>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
        {label}
      </dt>
      <dd className="text-lg sm:text-xl font-semibold text-ibn-navy tabular-nums leading-tight">
        {value}
      </dd>
      {sub ? (
        <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div>
      ) : null}
    </div>
  );
}

/**
 * Two horizontal bars showing how spend and leads split between the two
 * ad types — gives the head-to-head a single-glance read. CPL gets a
 * "winner" callout instead of a bar (it's a ratio, not a share).
 */
function ShareBars({ leadAds, website, all }) {
  const totalSpend = all?.spend || 0;
  const totalLeads = all?.leads || 0;
  const leadAdsCpl = leadAds?.costPerLead ?? null;
  const websiteCpl = website?.costPerLead ?? null;

  let cplWinner = null;
  if (leadAdsCpl !== null && websiteCpl !== null) {
    if (leadAdsCpl < websiteCpl) {
      cplWinner = {
        label: "Lead Ads",
        delta: websiteCpl - leadAdsCpl,
        accent: "text-ibn-orange",
      };
    } else if (websiteCpl < leadAdsCpl) {
      cplWinner = {
        label: "Website",
        delta: leadAdsCpl - websiteCpl,
        accent: "text-ibn-blue",
      };
    }
  }

  return (
    <div className="bg-white rounded-card shadow-card mt-4 p-4 sm:p-5">
      <SplitBar
        label="Spend split"
        leadAdsValue={leadAds?.spend || 0}
        websiteValue={website?.spend || 0}
        total={totalSpend}
        formatValue={formatCurrency}
      />
      <div className="h-3" aria-hidden />
      <SplitBar
        label="Leads split"
        leadAdsValue={leadAds?.leads || 0}
        websiteValue={website?.leads || 0}
        total={totalLeads}
        formatValue={formatNumber}
      />
      <div className="h-3" aria-hidden />
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Cost per lead
        </span>
        {cplWinner ? (
          <span className="tabular-nums">
            <span className={`font-semibold ${cplWinner.accent}`}>
              {cplWinner.label}
            </span>{" "}
            <span className="text-neutral-700">
              cheaper by {formatCurrency(cplWinner.delta)}
            </span>
          </span>
        ) : (
          <span className="text-neutral-500 text-xs">
            Need leads on both sides to compare
          </span>
        )}
      </div>
    </div>
  );
}

function SplitBar({ label, leadAdsValue, websiteValue, total, formatValue }) {
  const safeTotal = Math.max(total, leadAdsValue + websiteValue, 1);
  const leadAdsPct = (leadAdsValue / safeTotal) * 100;
  const websitePct = (websiteValue / safeTotal) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          {label}
        </span>
        <span className="text-xs text-neutral-700 tabular-nums">
          {formatValue(leadAdsValue)} · {formatValue(websiteValue)}
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden bg-neutral-100 flex">
        <div
          className="bg-ibn-orange h-full"
          style={{ width: `${leadAdsPct}%` }}
          aria-label={`Lead Ads ${leadAdsPct.toFixed(1)} percent`}
        />
        <div
          className="bg-ibn-blue h-full"
          style={{ width: `${websitePct}%` }}
          aria-label={`Website ${websitePct.toFixed(1)} percent`}
        />
      </div>
      <div className="flex justify-between text-[11px] text-neutral-500 tabular-nums mt-1">
        <span>{leadAdsPct.toFixed(1)}% Lead Ads</span>
        <span>{websitePct.toFixed(1)}% Website</span>
      </div>
    </div>
  );
}

function percent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
