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

- 2026-11-22: By design (maintainer request): in Automatic, when every accepted value is the untyped WP Consent API answer (rank 0), the tracker loads with HubSpot's banner left on and no `setHubSpotConsent`/`doNotTrack` (`leftToHubSpot`). Once any rank >= 1 value arrives, the current state, including rank 0 grants, is pushed as before. Do not flag the hand-off load itself as missing consent.
- 2026-11-22: By design: a consent source that throws during start-up denies every category at rank 2 (region default), so an explicit grant from a healthy source still wins. A single unreadable queue or dataLayer entry denies at rank 3 at its place in that source's sequence. Do not flag the difference.
- 2026-11-22: Accepted dataLayer limits in `src/consent.js`, do not re-raise: (a) the push setter keeps our wrapper as the visible `push`, so a script that re-hooks whenever `push !== itsOwn` adds a wrapper layer each time; (b) a non-Array `window.dataLayer` is not hooked; (c) the `seen` WeakSet skips an entry object pushed a second time, so re-pushing a retained `['consent', 'update', {...}]` constant after a different choice is ignored (`gtag()` always pushes a fresh `arguments` object, so it is not affected); (d) consent commands pushed to a detached, replaced dataLayer array still count. An existing get/set accessor on `window.dataLayer` is chained (its setter runs, then the value its getter returns is watched); an existing accessor on `push` is left alone and gets our wrapper by assignment. (e) Page scripts that deliberately throw from getters, proxies or setters are handled by failing closed where it is cheap and never breaking the page's own push; exhaustive coverage of hostile page scripts is out of scope. (f) A wrapper reads its own entries before the push it wraps, so when a page's push adds a grant before forwarding the visitor's denial, the grant is read last; neither read order matches every setup, and the tested case (a denial pushed before forwarding a grant) fails closed.
- 2026-11-22: When reviewing `dataLayer` hook changes, verify that the consent manager's accessor still runs and that a withdrawal reaches HubSpot after the accessor replaces the array or its `push` method.
- 2026-11-22: Playwright (1.59) wraps every `addInitScript` source in an IIFE, so `var x` in an init script is a local, not a global. Tests that need a real global `var` must inject a `<script>` tag or use another route.
- 2026-11-22: By design: "Wait for consent" (`strict` in the inline config, from the filtered raw setting) ignores the untyped WP Consent API answer, while Automatic keeps it as a rank 0 grant. Playground has no WP Consent API plugin, so tests fake Automatic with a setter on `window.hubspotFormBlockTracking` that forces `strict: false`.
- 2026-11-22: Accepted: during start-up, when two different sources disagree at equal rank, denial wins (their read order is unknown). This covers cross-source ties only. Order within one source (queue entries, dataLayer entries) is known and should still count. Do not re-raise the cross-source rule.
- 2026-11-22: Accepted: after start-up, a rank 0 (untyped WP Consent API) or rank 1 (Consent Mode default) grant can load the tracker before a later denial arrives. The tracker can't be unloaded; the later denial sends `doNotTrack` and `revokeCookieConsent`. Documented in the README. Do not re-raise.

- 2026-11-22: Accepted: under `optout` a typed WP Consent API read counts as an explicit choice and beats a Consent Mode default denial. Do not re-raise.
- 2026-11-22: Accepted trade-off: a region-scoped Consent Mode default denial applies to all visitors, because the visitor's region is unknown. It is documented in the README. Do not re-raise.
- 2026-11-22: Accepted: the deferred WP Consent API read on `wp_consent_type_defined` counts as explicit and may overwrite an earlier queue or GCM choice, because banners using that hook set the type before the visitor can choose. Do not re-raise.
- 2026-11-22: Accepted limits for consent mode: no public read API for Google Consent Mode, so GTM-template CMPs need the documented GTM tag; the WP Consent API reports everything granted until a CMP sets the consent type.
