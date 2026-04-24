/**
 * GET /api/health
 * Tells the dashboard which integrations are live vs mocked, so the UI can
 * show a badge per source. Never exposes token values.
 */

// Service-account creds can be supplied by JSON env var (production) or
// a file path on disk (local dev). Either counts as "configured".
function hasGoogleCreds() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_SERVICE_ACCOUNT_FILE
  );
}

export default function handler(req, res) {
  const mode = process.env.USE_MOCK_DATA === "true" ? "forced-mock" : "normal";
  const googleOk = hasGoogleCreds();

  // Meta spend is now read from a tab on the WIP sheet (not the Meta API),
  // so it shares credentials with the WIP sheet reader.
  const meta =
    process.env.META_SPEND_SHEET_RANGE && process.env.WIP_SHEET_ID && googleOk
      ? "configured"
      : "mock";

  // Referrals sheet is a separate spreadsheet (REFERRALS_SHEET_ID) — the
  // service account has to be shared on it explicitly.
  const referrals =
    process.env.REFERRALS_SHEET_ID && googleOk ? "configured" : "mock";

  // Pipedrive now only needs lead stages — referrals come from the sheet,
  // so PIPEDRIVE_REFERRAL_STAGE_IDS is optional.
  const pipedrive =
    process.env.PIPEDRIVE_API_TOKEN &&
    process.env.PIPEDRIVE_DOMAIN &&
    process.env.PIPEDRIVE_LEAD_STAGE_IDS
      ? "configured"
      : "mock";

  const wip =
    process.env.WIP_SHEET_ID && googleOk ? "configured" : "mock";

  res.status(200).json({
    mode,
    integrations: { meta, pipedrive, referrals, wip },
  });
}
