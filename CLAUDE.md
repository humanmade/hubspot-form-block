# HubSpot Form Block

WordPress block plugin that embeds HubSpot Forms v4 directly in page content. The form renders inline (not iframed) — HubSpot injects DOM into the container element.

## Plugin overview

Single block (`hubspot/form`) that:
- Accepts Portal ID, region, Form ID, redirect URL, submit button text, GTM event name
- Supports optional inner blocks as a success message shown in place of the form after submission
- Serves that success/gated content from a REST endpoint (`/hubspot-form-block/v1/unlock`) only after submission — the content is never embedded in the page. With a HubSpot private app token configured, the submission is verified server-side against HubSpot before the content is released.

## Architecture

```
src/                    # Source (compiled by @wordpress/scripts → build/)
├── block.json          # Block registration, attributes, supports
├── index.js            # Block registration entry
├── edit.js             # Block editor UI (InspectorControls + inner blocks)
├── save.js             # Saves inner block content (re-rendered by the unlock endpoint)
├── view.js             # Frontend JS: form events, success-message fetch/inject, GTM
├── render.php          # Server render callback — outputs form container + config (no message HTML)
├── editor.scss         # Editor-only styles
└── style.scss          # Frontend + editor styles
inc/
└── inline-message.php  # Unlock REST endpoint, block locating, submission verification, HMAC tokens
hubspot-form-block.php  # Plugin entry: registers block, enqueues HubSpot loader script
```

### Key patterns

**Config injection (`render.php`):** Each form instance gets a unique `target` ID (`hubspot-form-{formId}-{n}`). A `<script>` block writes `window.hsForms[target] = {...config}` so `view.js` can pick it up when HubSpot fires `hs-form-event:on-ready`. When inner blocks are present, the config also carries `gated`, `postId`, `formId`, `instance`, `restUrl`, and `pendingMessage`.

**Success message (server-fetched):**
The inner-block HTML is **never** emitted into the page. On `hs-form-event:on-submission:success`, `view.js` POSTs to `POST /wp-json/hubspot-form-block/v1/unlock`. The handler (`inc/inline-message.php`):
1. Validates the post is published/publicly viewable.
2. `locate_form_block()` — re-parses the post, walks blocks in document order (expanding `core/block` synced patterns), and matches the Nth `hubspot/form` instance for the form ID (mirrors render.php's per-formId counter). This makes the content **per-page and per-instance**.
3. Verifies the submission (see below), then `get_inline_message_html()` renders the located block's inner blocks and returns the HTML, which `view.js` injects. While unverified the endpoint returns `202` and the client polls with backoff; on failure it shows `pendingMessage`.

**Submission verification (strong vs best-effort):** `get_private_token()` resolves a HubSpot private app token from the `HUBSPOT_FORMS_PRIVATE_TOKEN` constant → `hubspot_form_block_private_token` filter → `hubspot_embed_private_app_token` option (never exposed via REST). When present (**strong mode**), `verify_hubspot_submission()` calls `https://api.hubapi.com/form-integrations/v1/submissions/forms/{formId}` (host is region-agnostic) and requires a recent submission matching the page URL and email — the conversionId is *not* in that API response, so matching is heuristic. The submissions list is transient-cached and the endpoint is per-IP rate-limited. Without a token (**best-effort mode**) content is returned directly.

**Repeat visits / `persistSuccess`:** On first unlock the server mints an HMAC `unlockToken` (`mint_unlock_token()`, signed with `wp_salt()`); `view.js` stores `{ path, token }` in `localStorage` keyed `hs-form-submitted:{formId}`. On return visits a slim inline `<script>` in render.php hides the form (no content exposed) and `view.js` replays the token, which `verify_unlock_token()` validates with no HubSpot call. `.is-hubspot-form-first-submission` blocks are stripped client-side on repeat visits only.

## Dev workflow

```bash
npm run start           # Watch mode — compiles src/ to build/ (includes render.php)
npm run build           # Production build
npm run playground:start  # Start local WP via Playground on :9400
npm run test:e2e        # Run Playwright tests (starts Playground automatically)
npm run test:e2e:debug  # Playwright debug mode
npm run test:e2e:watch  # Playwright UI mode
npm run lint:js         # Lint JS
npm run lint:css        # Lint CSS
```

The `--webpack-copy-php` flag on `build`/`start` is required — it copies `render.php` from `src/` to `build/`.

## Release workflow

1. Push to `main` → `build-and-release.yml` automatically merges built `build/` into the `release` branch.
2. Create a GitHub Release with a semver tag → `release.yml` replaces `__VERSION__` placeholder in `hubspot-form-block.php`, commits, retags, and uploads `hubspot-form-block.zip`.

## Test credentials

- Portal ID: `148262752`
- Form ID: `ec0707d2-b7f5-47c5-bfef-76eb7e8f837e`

## Gotchas

- The HubSpot form renders **inline, not in an iframe** — it injects DOM directly into `<div id="{target}">`. Allow time for `hs-form-event:on-ready` before asserting form elements exist.
- `--webpack-copy-php` is required in `build`/`start` scripts so `render.php` is included in `build/`. Do not remove it.
- Block attributes are in `src/block.json`. The `inlineMessage` attribute in `block.json` is legacy (kept for backward-compat migration) — the live success-message mechanism now fetches inner-block content from the unlock REST endpoint, not the `inlineMessage` string or the old `<template>`.
- Strong-mode verification can't be exercised in Playground (no HubSpot token, no outbound HTTP). The default E2E suite covers best-effort mode against the real endpoint and mocks the endpoint (`mockUnlockEndpoint` in `tests/helpers.js`) for polling/repeat-visit cases. To test strong mode, set the `hubspot_form_block_private_token` filter and short-circuit the HubSpot call via `pre_http_request`.
- `build/` is committed on the `release` branch (via GitHub Actions) but gitignored on `main`.
