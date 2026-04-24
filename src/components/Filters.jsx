import { useMemo } from "react";

/**
 * Filter bar.
 *
 * - Date-range preset chips + custom from/to inputs.
 * - Platform (Meta/Google) — Google disabled until the v2 integration lands.
 * - Campaign dropdown — populated from /api/summary's campaigns payload.
 * - Builder/Job filter — populated from contracts + any job-number we saw
 *   on a campaign or deal (so unmatched spend is still discoverable).
 *
 * Designed to wrap gracefully at 640/960/1280px.
 */
export default function Filters({
  range,
  onRangeChange,
  filters,
  onFiltersChange,
  campaigns = [],
  contracts = [],
}) {
  const builderOptions = useMemo(() => {
    const map = new Map();
    contracts.forEach((c) => map.set(c.jobNumber, c.builderName || c.jobNumber));
    campaigns.forEach((c) => {
      if (c.jobNumber && !map.has(c.jobNumber)) {
        map.set(c.jobNumber, c.jobNumber);
      }
    });
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "en-AU")
    );
  }, [contracts, campaigns]);

  const campaignOptions = useMemo(() => {
    // If a platform filter is active, narrow campaigns to that platform.
    const list = filters.platform
      ? campaigns.filter((c) => c.platform === filters.platform)
      : campaigns;
    return [...list].sort((a, b) =>
      (a.campaignName || "").localeCompare(b.campaignName || "", "en-AU")
    );
  }, [campaigns, filters.platform]);

  function applyPreset(days) {
    const until = toIso(new Date());
    const s = new Date();
    s.setDate(s.getDate() - (days - 1));
    onRangeChange({ since: toIso(s), until });
  }

  function applyMtd() {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    onRangeChange({ since: toIso(s), until: toIso(now) });
  }

  function applyYtd() {
    const now = new Date();
    const s = new Date(now.getFullYear(), 0, 1);
    onRangeChange({ since: toIso(s), until: toIso(now) });
  }

  return (
    <section className="bg-white rounded-card shadow-card p-4 sm:p-5 mb-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mr-1">
            Period
          </span>
          <PresetButton label="Last 7" onClick={() => applyPreset(7)} />
          <PresetButton label="Last 30" onClick={() => applyPreset(30)} />
          <PresetButton label="Last 90" onClick={() => applyPreset(90)} />
          <PresetButton label="MTD" onClick={applyMtd} />
          <PresetButton label="YTD" onClick={applyYtd} />
          <div className="flex items-center gap-2 ml-0 sm:ml-2">
            <label className="text-xs text-neutral-500">From</label>
            <input
              type="date"
              value={range.since}
              onChange={(e) =>
                onRangeChange({ ...range, since: e.target.value })
              }
              className="text-sm border border-neutral-200 rounded-md px-2 py-1 focus:border-ibn-blue"
            />
            <label className="text-xs text-neutral-500">to</label>
            <input
              type="date"
              value={range.until}
              onChange={(e) =>
                onRangeChange({ ...range, until: e.target.value })
              }
              className="text-sm border border-neutral-200 rounded-md px-2 py-1 focus:border-ibn-blue"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FilterSelect
            label="Platform"
            value={filters.platform || ""}
            onChange={(v) =>
              onFiltersChange({
                ...filters,
                platform: v || null,
                // Clear campaign if it's from a different platform.
                campaignId:
                  v && filters.campaignId
                    ? campaigns.find(
                        (c) => c.campaignId === filters.campaignId
                      )?.platform === v
                      ? filters.campaignId
                      : null
                    : filters.campaignId,
              })
            }
            options={[
              { value: "", label: "All platforms" },
              { value: "meta", label: "Meta" },
              { value: "google", label: "Google (coming in v2)", disabled: true },
            ]}
          />
          <FilterSelect
            label="Campaign"
            value={filters.campaignId || ""}
            onChange={(v) =>
              onFiltersChange({ ...filters, campaignId: v || null })
            }
            options={[
              { value: "", label: "All campaigns" },
              ...campaignOptions.map((c) => ({
                value: c.campaignId,
                label: `${c.campaignName} (${c.platform})`,
              })),
            ]}
          />
          <FilterSelect
            label="Builder / Job"
            value={filters.jobNumber || ""}
            onChange={(v) =>
              onFiltersChange({ ...filters, jobNumber: v || null })
            }
            options={[
              { value: "", label: "All builders" },
              ...builderOptions.map(([jobNumber, label]) => ({
                value: jobNumber,
                label: `${label} — ${jobNumber}`,
              })),
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function PresetButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full border border-neutral-200 hover:border-ibn-blue hover:text-ibn-blue transition-colors"
    >
      {label}
    </button>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-neutral-200 rounded-md px-2.5 py-2 bg-white focus:border-ibn-blue"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
