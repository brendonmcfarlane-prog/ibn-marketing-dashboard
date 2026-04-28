import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import AdTypeComparison from "@/components/AdTypeComparison";
import AdTypeCampaignBreakdown from "@/components/AdTypeCampaignBreakdown";
import { daysAgoIso, todayIso } from "@/lib/format";

/**
 * Lead Ads vs Website comparison page.
 *
 * Top-of-funnel only — Spend, Leads, Cost Per Lead — split by Meta
 * campaigns tagged "[LA]" (Lead Ads) vs everything else (Website).
 *
 * Bottom-of-funnel (Referrals, Revenue, ROMS) is intentionally absent
 * because referrals attribute to a job, not a campaign — see
 * /api/meta-comparison header for the reasoning.
 *
 * Lighter than the main dashboard: only a date range picker, no builder
 * or campaign filter (the comparison only makes sense at the global level).
 */
export default function MetaAdsComparison() {
  const [range, setRange] = useState({
    since: daysAgoIso(29),
    until: todayIso(),
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("since", range.since);
    p.set("until", range.until);
    return p.toString();
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta-comparison?${queryString}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const sources = data?.sources;

  return (
    <Layout sources={sources}>
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-ibn-navy leading-tight">
          Lead Ads vs Website
        </h1>
        <p className="text-sm text-neutral-600 mt-1 max-w-3xl">
          Top-of-funnel comparison of Meta campaigns running as in-platform
          Lead Ads versus campaigns sending traffic to the website.
          Campaigns whose name contains <code className="px-1 py-0.5 rounded bg-neutral-100 text-[12px]">Website</code> are
          classified as Website; everything else is treated as Lead Ads.
          Revenue and ROMS aren't shown here because referrals attribute
          to a job, not a campaign.
        </p>
      </div>

      {error && (
        <div className="bg-ibn-orange/15 text-ibn-navy border border-ibn-orange/40 rounded-card px-4 py-3 mb-4 text-sm">
          <strong className="font-semibold">Couldn't load comparison:</strong>{" "}
          {error}
        </div>
      )}

      <DateRangeBar range={range} onRangeChange={setRange} />

      {loading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <>
          <AdTypeComparison totals={data.totals} />
          <AdTypeCampaignBreakdown campaigns={data.campaigns || []} />
        </>
      ) : null}

      {loading && data && (
        <div className="fixed bottom-4 right-4 bg-ibn-navy text-white text-xs px-3 py-1.5 rounded-full shadow-card">
          Refreshing…
        </div>
      )}
    </Layout>
  );
}

/**
 * Slimmed-down date range picker — preset chips + from/to inputs.
 * Replicates the date-handling logic from Filters.jsx without any of the
 * builder/campaign/platform dropdowns (those don't make sense here).
 */
function DateRangeBar({ range, onRangeChange }) {
  const applyPreset = (days) => {
    onRangeChange({
      since: daysAgoIso(days - 1),
      until: todayIso(),
    });
  };

  const applyMtd = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    onRangeChange({ since: toIso(first), until: todayIso() });
  };

  const applyYtd = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), 0, 1);
    onRangeChange({ since: toIso(first), until: todayIso() });
  };

  return (
    <section className="bg-white rounded-card shadow-card p-4 sm:p-5 mb-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1.5">
            Date range
          </div>
          <div className="flex flex-wrap gap-2">
            <PresetButton onClick={() => applyPreset(7)}>Last 7</PresetButton>
            <PresetButton onClick={() => applyPreset(30)}>Last 30</PresetButton>
            <PresetButton onClick={() => applyPreset(90)}>Last 90</PresetButton>
            <PresetButton onClick={applyMtd}>MTD</PresetButton>
            <PresetButton onClick={applyYtd}>YTD</PresetButton>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <DateField
            label="From"
            value={range.since}
            onChange={(v) => onRangeChange({ ...range, since: v })}
          />
          <DateField
            label="To"
            value={range.until}
            onChange={(v) => onRangeChange({ ...range, until: v })}
          />
        </div>
      </div>
    </section>
  );
}

function PresetButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium px-3 py-1.5 rounded-full border border-neutral-200 text-ibn-navy hover:border-ibn-orange hover:text-ibn-orange transition-colors"
    >
      {children}
    </button>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <label className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-neutral-200 rounded-md px-3 py-1.5 text-sm text-ibn-navy focus:outline-none focus:border-ibn-orange focus:ring-1 focus:ring-ibn-orange"
      />
    </label>
  );
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-card shadow-card p-5 h-40 animate-pulse"
        >
          <div className="h-3 w-24 bg-neutral-100 rounded mb-3" />
          <div className="h-8 w-32 bg-neutral-100 rounded mb-2" />
          <div className="h-3 w-40 bg-neutral-100 rounded" />
        </div>
      ))}
    </div>
  );
}
