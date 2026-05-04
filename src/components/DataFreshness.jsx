import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

/**
 * Renders the latest dates seen in the Meta spend sheet and Leads Master
 * sheet. Sits under the source badges so you can tell at a glance whether
 * yesterday's data has actually landed in the upstream sheets yet.
 */
export default function DataFreshness() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/data-freshness")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!data) return null;
  return (
    <div className="text-[11px] text-white/60 mt-1.5">
      Spend through {data.spendLatest ? formatDate(data.spendLatest) : "—"}
      {" · "}
      Leads through {data.leadsLatest ? formatDate(data.leadsLatest) : "—"}
    </div>
  );
}
