# Review

## What failure looks like here

- A form that does not render, or renders twice, on the front end (HubSpot injects DOM inline after `hs-form-event:on-ready`).
- HubSpot's tracking script (`hs-scripts.com`) loading, or setting cookies, before the visitor consents when the site is in consent mode. Or the opposite: a visitor who consented is not tracked.
- Block attributes (portal ID, region, form ID) reaching script URLs or inline `<script>` blocks without validation.
- `render.php` changes that are not copied to `build/` (`--webpack-copy-php` must stay on `build`/`start`).

## Always check

- Plugin header says Requires PHP 8.2 (CI tests 8.2 and 8.4) and Requires at least 6.1: no PHP 8.3+ only syntax or functions (typed class constants, `json_validate`), and no WP 6.3+ only APIs without a fallback.
- Script loading works in block themes, where templates render before `wp_head`, and in classic themes.
- Editor controls that write site settings are gated by `canUser( 'update', 'settings' )`.
- Playwright tests stub third-party network (`page.route`) instead of depending on HubSpot being reachable; tests run with `workers: 1` and share site options, so each spec restores what it changes.
- Consent logic in `src/consent.js`: ordering across sources, queue replay before `DOMContentLoaded`, and HubSpot `_hsq`/`_hsp` commands queued before the async tracker runs.

## Paths that need a person

- `.github/workflows/` (release, build-and-release, PR Playground preview has had a script-injection fix)
- `src/consent.js` and the tracking-mode code in `hubspot-form-block.php` (privacy and consent compliance)

## Skip

- `build/`, `package-lock.json`, `playwright-report/`, `test-results/`, `artifacts/`

## Nits

Cap at 3. Comment wording only when it describes removed or replaced behaviour.

## Learned

- 2026-11-24: By design: `tests/gtm.spec.js` runs against the live sandbox GTM container GTM-MTNXSKGJ (owned by the maintainer) in CI, ungated. Changing that container's tags needs the spec header and assertions updated in the same change. Do not flag the live GTM dependency.
- 2026-11-24: Accepted in `src/consent.js` `apply()`: `window.disableHubSpotCookieBanner` is set before the first `_hsp` push, even if that push fails and the tracker is not loaded. Do not flag.
- 2026-11-24: Accepted: the `window.hubspotFormBlockConsent` push wrapper applies the entries before it calls the original `push`. Do not flag the order.
- 2026-11-24: By design: `get_tracking_mode()` and the setting's sanitizer treat any unknown value, including a filter result, as `always`. Do not flag it as failing open.
- 2026-11-24: By design: `src/consent.js` does not read Google Consent Mode or `window.dataLayer`. GTM consent tools reach the plugin through the README's Custom HTML tags, which push to the JS API queue. Do not flag missing Consent Mode support.
- 2026-11-24: By design: the untyped WP Consent API answer (no `wp_consent_type`, no fallback type, or the wait-for hook set and the type not yet defined) is ignored. A typed `optout` read with no cookie counts as a grant, because that is the consent banner's policy.
- 2026-11-24: By design: at start-up a category is granted only if no source (queue, typed WP Consent API) denies it. Queue entries are read in order. After start-up the latest change wins, so a grant can load the tracker before a later denial. The tracker can't be unloaded; the denial sends `setHubSpotConsent`, `revokeCookieConsent` (analytics true to false) and `doNotTrack`. Documented in the README. Do not re-raise.
- 2026-11-24: By design: an unreadable queue entry, or a WP Consent API that throws at start-up or on `wp_consent_type_defined`, denies every category. A later explicit grant still wins.
- 2026-11-24: Accepted: the WP Consent API read on `wp_consent_type_defined` counts as a change and may overwrite an earlier queue choice, because banners using that hook set the type before the visitor can choose. Do not re-raise.
- 2026-11-22: Playwright (1.59) wraps every `addInitScript` source in an IIFE, so `var x` in an init script is a local, not a global. Tests that need a real global `var` must inject a `<script>` tag or use another route.
