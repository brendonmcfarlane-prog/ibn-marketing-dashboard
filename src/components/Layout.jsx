import Link from "next/link";
import { useRouter } from "next/router";
import SourceBadges from "./SourceBadges";

/**
 * App shell. Navy header with brand wordmark, page-tabs row, orange
 * accent rule, and a responsive padded container. Mobile-friendly —
 * the header collapses < 640px and the tabs scroll horizontally if
 * they don't fit.
 */
const NAV_TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/meta-ads-comparison", label: "Lead Ads vs Website" },
];

export default function Layout({ children, sources }) {
  const router = useRouter();
  const activePath = router?.pathname || "/";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ibn-navy text-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="h-8 w-8 rounded-md bg-ibn-orange grid place-items-center text-white font-bold"
            >
              i
            </div>
            <div>
              <div className="text-lg font-semibold leading-tight">
                iBuildNew · Marketing Dashboard
              </div>
              <div className="text-xs text-white/70">
                Paid media · leads · referrals · revenue by builder contract
              </div>
            </div>
          </div>
          <SourceBadges sources={sources} />
        </div>
        <nav
          aria-label="Primary"
          className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10"
        >
          <ul className="flex gap-1 overflow-x-auto -mb-px">
            {NAV_TABS.map((tab) => {
              const isActive = activePath === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={`inline-block whitespace-nowrap text-sm px-3 sm:px-4 py-2.5 border-b-2 transition-colors ${
                      isActive
                        ? "border-ibn-orange text-white font-semibold"
                        : "border-transparent text-white/70 hover:text-white"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="h-1 bg-ibn-orange" />
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-4 text-xs text-neutral-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>Prototype — local only. Not connected to production reporting.</span>
          <span>Built for the IBN paid media team.</span>
        </div>
      </footer>
    </div>
  );
}
