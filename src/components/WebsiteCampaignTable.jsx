import { useState } from "react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

function ChannelChip({ channel }) {
  const isGoogle = channel === "google";
  const cls = isGoogle ? "bg-ibn-blue/10 text-ibn-blue" : "bg-ibn-orange/10 text-ibn-orange";
  const label = isGoogle ? "Google Ads" : "Meta Ads";
  return <span className={`inline-block text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function num(v, fn) { return v == null ? "—" : fn(v); }

function SortHeader({ label, sortKey, currentKey, currentDir, onSort, align = "left" }) {
  const isActive = currentKey === sortKey;
  const arrow = isActive ? (currentDir === "asc" ? "↑" : "↓") : "";
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-4 py-2.5 font-semibold cursor-pointer select-none hover:text-ibn-orange transition-colors ${align === "right" ? "text-right" : "text-left"} ${isActive ? "text-ibn-orange" : ""}`}
    >
      {label} <span className="inline-block min-w-[10px]">{arrow}</span>
    </th>
  );
}

export default function WebsiteCampaignTable({ campaigns, showPostcodeMatch = false }) {
  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");

  if (!campaigns || campaigns.length === 0) {
    return <section className="bg-white rounded-card shadow-card p-5 text-sm text-neutral-500">No Website-classified campaigns in the selected date range.</section>;
  }

  function handleSort(key) {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function sortFn(a, b) {
    const av = a[sortKey]; const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === "asc" ? (av - bv) : (bv - av);
  }

  const sorted = [...campaigns].sort(sortFn);
  const totalSpend = sorted.reduce((s, c) => s + (c.spend || 0), 0);

  return (
    <section className="bg-white rounded-card shadow-card overflow-hidden">
      <header className="px-4 sm:px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ibn-navy">Campaign breakdown</h2>
        <span className="text-xs text-neutral-500">{sorted.length} {sorted.length === 1 ? "campaign" : "campaigns"} · {formatCurrency(totalSpend)} total</span>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <SortHeader label="Campaign" sortKey="campaignName" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Channel" sortKey="channel" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Job #" sortKey="jobNumber" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Spend" sortKey="spend" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Clicks" sortKey="clicks" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Leads" sortKey="leads" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              {showPostcodeMatch && (
                <>
                  <SortHeader label="Unique" sortKey="matchedAny" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Matched" sortKey="matchedStrict" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Match %" sortKey="matchRateStrict" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Cost / Matched" sortKey="costPerLeadReferred" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                </>
              )}
              <SortHeader label="Cost / Lead" sortKey="costPerLead" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Total Leads" sortKey="totalLeads" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Total CPL" sortKey="totalCostPerLead" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              {showPostcodeMatch && (
                <>
                  <SortHeader label="Rev @ Current" sortKey="revenueAtCurrentRpl" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Rev @ Future" sortKey="revenueAtFutureRpl" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                </>
              )}
              <SortHeader label="Conv. Rate" sortKey="conversionRate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((c) => (
              <tr key={c.campaignId} className="hover:bg-neutral-50">
                <td className="px-4 py-2.5 text-ibn-navy">{c.campaignName || c.campaignId}</td>
                <td className="px-4 py-2.5"><ChannelChip channel={c.channel} /></td>
                <td className="px-4 py-2.5 text-neutral-700 tabular-nums">{c.jobNumber || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(c.spend)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.clicks)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.leads)}</td>
                {showPostcodeMatch && (
                  <>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.matchedAny || 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.matchedStrict || 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(c.matchRateStrict, (v) => formatPercent(v, { decimals: 1 }))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(c.costPerLeadReferred, formatCurrency)}</td>
                  </>
                )}
                <td className="px-4 py-2.5 text-right tabular-nums">{num(c.costPerLead, formatCurrency)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.totalLeads || 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{num(c.totalCostPerLead, formatCurrency)}</td>
                {showPostcodeMatch && (
                  <>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(c.revenueAtCurrentRpl, formatCurrency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(c.revenueAtFutureRpl, formatCurrency)}</td>
                  </>
                )}
                <td className="px-4 py-2.5 text-right tabular-nums">{num(c.conversionRate, (v) => formatPercent(v, { decimals: 2 }))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
