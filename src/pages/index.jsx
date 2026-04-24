import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import Filters from "@/components/Filters";
import KpiCards from "@/components/KpiCards";
import BuildersTable from "@/components/BuildersTable";
import CampaignTable from "@/components/CampaignTable";
import { daysAgoIso, todayIso } from "@/lib/format";

/**
 * Dashboard page.
 *
 * State is deliberately minimal — date range + filters drive a single
 * /api/summary call, and that response feeds all sub-components. Means
 * there's one place to look when numbers don't match expectations.
 */
export default function Home() {
  const [range, setRange] = useState({
    since: daysAgoIso(29),
    until: todayIso(),
  });
  const [filters, setFilters] = useState({
    jobNumber: null,
    campaignId: null,
    platform: null,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("since", range.since);
    p.set("until", range.until);
    if (filters.jobNumber) p.set("jobNumber", filters.jobNumber);
    if (filters.campaignId) p.set("campaignId", filters.campaignId);
    if (filters.platform) p.set("platform", filters.platform);
    return p.toString();
  }, [range, filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/summary?${queryString}`);
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
      {error && (
        <div className="bg-ibn-orange/15 text-ibn-navy border border-ibn-orange/40 rounded-card px-4 py-3 mb-4 text-sm">
          <strong className="font-semibold">Couldn't load dashboard:</strong>{" "}
          {error}
        </div>
      )}

      <Filters
        range={range}
        onRangeChange={setRange}
        filters={filters}
        onFiltersChange={setFilters}
        campaigns={data?.campaigns || []}
        contracts={data?.contracts || []}
      />

      {loading && !data ? (
        <LoadingSkeleton />
      ) : data ? (
        <>
          <KpiCards total={data.total} />
          <BuildersTable
            rows={data.rows}
            onSelectJob={(jobNumber) =>
              setFilters((f) => ({
                ...f,
                jobNumber: f.jobNumber === jobNumber ? null : jobNumber,
              }))
            }
          />
          <CampaignTable campaigns={data.campaigns || []} />
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

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-3 mb-6">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-card shadow-card p-4 h-24 animate-pulse"
        >
          <div className="h-3 w-24 bg-neutral-100 rounded mb-3" />
          <div className="h-6 w-28 bg-neutral-100 rounded" />
        </div>
      ))}
    </div>
  );
}
