import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import WebsiteKpiStrip from "@/components/WebsiteKpiStrip";
import WebsiteCampaignTable from "@/components/WebsiteCampaignTable";
import { daysAgoIso, todayIso, formatNumber } from "@/lib/format";

/**
 * Website Performance page.
 *
 * Per-campaign detail for Meta campaigns classified as Website. Spend
 * and Clicks come from the Meta spend sheet; Leads come from the Leads
 * Master sheet, matched on utm_campaign via suffix-of-name.
 *
 * Lead Ads campaigns are intentionally excluded — those capture leads
 * in-platform and don't appear in the Leads Master sheet.
 */
export default function WebsitePerformance() {
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
      const res = await fetch(`/api/website-performance?${queryString}`);
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
          Website Performance
        </h1>
        <p className="text-sm text-neutral-600 mt-1 max-w-3xl">
          Per-campaign detail for Meta campaigns sending traffic to the
          website. Leads come from the Leads Master sheet, matched on{" "}
          <code className="px-1 py-0.5 rounded bg-neutral-100 text-[12px]">utm_campaign</code>{" "}
          (placement-prefixed campaign name). Conversion Rate is{" "}
          <strong>Leads ÷ Clicks</strong>.
        </p>
      </div>

      {error && (
        <div className="bg-ibn-orange/15 text-ibn-navy border border-ibn-orange/40 rounded-card px-4 py-3 mb-4 text-sm">
          <strong className="font-semibold">
            Couldn't load website performance:
          </strong>{" "}
          {error}
        </div>
      )}

      <DateRangeBar range={range} onRangeChange={setRange} />

      {loading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <>
          <WebsiteKpiStrip totals={data.totals} />
          {data.totals?.unmatchedLeads > 0 ? (
            <UnmatchedNote
              unmatched={data.totals.unmatchedLeads}
              considered={data.totals.leadsConsidered}
            />
          ) : null}
          <WebsiteCampaignTable campaigns={data.campaigns || []} />
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
 * Surfaces the count of leads that were filtered to Website / paid /
 * Facebook in the Leads Master sheet but didn't suffix-match any of the
 * Website Meta campaigns. Usually a UTM-tagging issue on a new campaign.
 */
function UnmatchedNote({ unmatched, considered }) {
  return (
    <div className="bg-ibn-orange/10 border border-ibn-orange/30 text-ibn-navy rounded-card px-4 py-3 mb-4 text-sm">
      <strong className="font-semibold">
        {formatNumber(unmatched)} of {formatNumber(considered)}
      </strong>{" "}
      Website leads in this date range couldn't be matched to a Meta campaign.
      Most often this is a UTM tagging drift on a new campaign — check the
      ad-set's URL parameters in Ads Manager.
    </div>
  );
}

/**
 * Slimmed-down date range picker — preset chips + from/to inputs.
 * Mirrors the one on /meta-ads-comparison so the two views feel identical.
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
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-card shadow-card p-4 h-24 animate-pulse"
          >
            <div className="h-3 w-20 bg-neutral-100 rounded mb-3" />
            <div className="h-6 w-24 bg-neutral-100 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-card shadow-card p-5 h-40 animate-pulse">
        <div className="h-3 w-40 bg-neutral-100 rounded mb-4" />
        <div className="space-y-2">
          <div className="h-3 w-full bg-neutral-100 rounded" />
          <div className="h-3 w-full bg-neutral-100 rounded" />
          <div className="h-3 w-3/4 bg-neutral-100 rounded" />
        </div>
      </div>
    </>
  );
}
