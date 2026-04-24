/**
 * Small pill indicators showing whether each data source is live or mocked.
 * Keeps the team honest — it's easy to forget you're looking at sample data.
 */
export default function SourceBadges({ sources = {} }) {
  const items = [
    { key: "meta", label: "Meta Ads" },
    { key: "pipedrive", label: "Pipedrive" },
    { key: "referrals", label: "Referrals" },
    { key: "wip", label: "WIP Sheet" },
  ];

  return (
    <div className="flex flex-wrap gap-2" aria-label="Data source status">
      {items.map(({ key, label }) => {
        const status = sources[key] || "mock";
        const isLive = status === "live";
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
              isLive
                ? "bg-white/10 text-white"
                : "bg-ibn-orange/15 text-white"
            }`}
            title={isLive ? `${label}: live API` : `${label}: using mock data`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                isLive ? "bg-ibn-blue" : "bg-ibn-orange"
              }`}
            />
            {label}: {isLive ? "live" : "mock"}
          </span>
        );
      })}
    </div>
  );
}
