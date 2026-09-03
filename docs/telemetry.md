# Telemetry removal

This fork removes the CRM vendor telemetry package, callers, rollup service, and browser analytics.
No opt-in switch restores these paths.
Historical database migrations and their tables remain for upgrade compatibility.
Framework diagnostics, first-party visitor tracking, and external integrations require separate review.
See `PRIVACY.md` for scope and outstanding work.
