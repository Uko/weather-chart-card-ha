# RTL port compatibility notes

Reference: [yosilevy/weather-chart-card, RTL-fixes](https://github.com/yosilevy/weather-chart-card/tree/012356ddf91e84a6fcabeaf0f554bdd5c6655140).
The RTL implementation originates in commit e2c13ce; the branch also adds
browser coverage in 012356d. This port targets this repository's 3309c8b base.

## Changes carried over

- Hebrew weather, weekday, month, wind-direction, unit, and forecast-label translations.
- Full weekday labels on RTL pages instead of truncated Hebrew labels.
- Explicit RTL context for each nonempty precipitation canvas-label line,
  preserving the blank separator before probability labels.
- RTL attribute layout with isolated left-to-right temperature and numeric readings.
- Date text follows Home Assistant's direction setting; the chart timeline stays LTR.

## Adaptations

- Kept this repository's Intl-first weekday formatting and timezone handling.
  RTL requests a long weekday from Intl; its translation-array fallback also keeps
  the whole name. LTR continues using the existing short, localized weekday labels.
- Kept the existing Intl date formatter: it already provides Hebrew day/month order
  and respects locale and timezone. The reference branch's manual date reversal
  would replace this newer behavior unnecessarily.
- Daily/Hourly translations already exist here. Kept their current wording and the
  button's destination-view meaning (a daily chart offers Hourly), plus disabled
  Auto mode. Added Hebrew Auto and the extra kn, cm, l/m2, and kg/m2 unit labels
  required by this repository's translation schema.
- Wrapped this repository's converted dew-point, visibility, and wind/gust values;
  kept its conversion logic, source units, display units, visibility flags, and
  forecast-only behavior. The older reference markup used some raw source values.
- Extended numeric bidi isolation to UV and wind/gust readings as well as humidity,
  pressure, dew point, and visibility. Wind-direction text continues inheriting RTL.
- Added a fallback to inherited direction when HA's --direction variable is absent.
- Excluded the branch's unrelated rebranding, release changes, and legacy aliases.
  The existing weather-chart-card-ha element, editor, and bundle filename remain.
- Rebuilt the tracked bundle from this repository's sources. This also incorporates
  its pre-existing zh-Hant source translations, which were missing from that bundle.
- Added Playwright browser tests and validation-workflow coverage. Playwright uses
  the 1.56 patch line to remain compatible with this repository's Node 18 CI.
  npm also synchronized the lockfile's stale package version from 1.7.0 to the
  existing package.json version, 1.7.1; no release version was bumped.

## Validation

ESLint and Rollup complete successfully. Seven tests cover translation completeness
and the shipped bundle in English, regional Hebrew (he-IL), and Traditional Chinese
(zh-Hant), each at 390px and 1200px viewport widths. Browser cases check weekday
formatting across timezone boundaries, locale-native dates, numeric direction,
converted units, multiline precipitation labels, two-way forecast switching,
forecast-only mode, localized disabled Auto labels, and browser errors. Hebrew
also exercises the translation fallback when Intl rejects a locale.

Run npm run build, install Chromium with npx playwright install chromium, then run
npm run test:rtl. Windows defaults to installed Microsoft Edge; PLAYWRIGHT_CHANNEL
can select another installed channel. The local run used Edge; CI uses Chromium.
These tests mock HA's weather subscription API; a live HA instance was not used.
