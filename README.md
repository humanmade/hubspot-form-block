# HubSpot Form Block

A WordPress block plugin that embeds HubSpot Forms v4 directly in page content. Forms render inline (not iframed) — HubSpot injects DOM into the container element.

## Features

- **HubSpot Forms v4 API** — uses the modern developer embed API
- **Inline success message** — add any WordPress blocks as the post-submission message; shown in place of the form after submission. The content is never embedded in the page — it is fetched from a REST endpoint only after submitting, so it can't be read from the page source.
- **Gated content** — the success content is served only after a submission. With a HubSpot private app token configured, the submission is verified server-side against HubSpot before the content is released (see [Gated content security](#gated-content-security)). Supports a "First Submission Message" block for content only shown at the moment of first submission, and remembers returning visitors per page URL.
- **Global settings** — set Portal ID and region site-wide; override per block instance
- **Google Tag Manager** — fires a configurable dataLayer event on submission (default: `hubspot_form_submit`)
- **Deferred script loading** — HubSpot tracking JS loaded asynchronously in the footer
- **Custom submit button text** — override the form's submit button label per block instance
- **Redirect on submit** — optionally redirect to a URL instead of showing an inline message
- **Multiple instances** — multiple instances of the same form on a single page are fully supported

## Block settings

| Setting | Description |
|---|---|
| Portal ID | HubSpot portal ID. Can be set as a global default and overridden per block. |
| Region | `eu1` (Europe) or `na1` (North America). Can be set as a global default. |
| Form ID | HubSpot form ID. |
| Redirect URL | Redirect to this URL after submission. Overrides the inline message if set. |
| Submit button text | Override the form's submit button label. |
| GTM event name | dataLayer event name pushed on submission. Defaults to `hubspot_form_submit`. |
| Success message (inner blocks) | WordPress blocks shown in place of the form after successful submission. Fetched from the server after submitting (never embedded in the page). Not shown if a redirect URL is set. |
| Enable gated content | When on, the success content is treated as gated: it is fetched only after a submission and, returning visitors are remembered per page URL (an unlock token stored in `localStorage`) so they see it again without re-submitting. Use the "Insert First Submission Message" button to add a block whose content is only shown at the moment of the first submission — stripped on subsequent visits. Disabled when a redirect URL is set. |

## Global settings

Portal ID and region can be set globally via **Settings → General** in the WordPress admin (or via the REST API at `/wp-json/wp/v2/settings`). Individual block instances can override these values. Admins can promote per-block values to global defaults using the "Set as global defaults" button in the block sidebar.

## Styling forms

Forms can be styled from within the HubSpot dashboard, or by overriding the CSS variables documented here:

https://developers.hubspot.com/docs/cms/start-building/features/forms/forms#define-custom-styling-for-embedded-forms-using-css

## Installation

1. Download `hubspot-form-block.zip` from the [latest release](https://github.com/humanmade/hubspot-form-block/releases/latest).
2. Upload and activate via **Plugins → Add New → Upload Plugin** in the WordPress admin.
3. Set your Portal ID and region under **Settings → General**.
4. Insert the **HubSpot Form** block and enter your Form ID.

## Developer workflow

```bash
npm install
npm run start           # Watch mode — compiles src/ to build/
npm run build           # Production build
npm run playground:start  # Start local WordPress via Playground on :9400
npm run test:e2e        # Run Playwright E2E tests (starts Playground automatically)
npm run test:e2e:debug  # Playwright debug mode
npm run test:e2e:watch  # Playwright UI mode
npm run lint:js         # Lint JS
npm run lint:css        # Lint CSS
```

> **Note:** The `--webpack-copy-php` flag on `build`/`start` is required — it copies `render.php` from `src/` to `build/`. Do not remove it.

## Architecture

```
src/
├── block.json          # Block registration, attributes, supports
├── index.js            # Block registration entry
├── edit.js             # Block editor UI (InspectorControls + inner blocks)
├── save.js             # Saves inner block content
├── view.js             # Frontend JS: form events, success-message fetch/inject, GTM
├── render.php          # Server render: form container + config (no success-message HTML)
├── editor.scss         # Editor-only styles
└── style.scss          # Frontend + editor styles
inc/
└── inline-message.php  # Unlock REST endpoint, block locating, submission verification
hubspot-form-block.php  # Plugin entry: block registration, script enqueue, settings API
```

**Config injection:** Each form instance gets a unique target ID (`hubspot-form-{formId}-{n}`). A `<script>` block writes `window.hsForms[target] = {...config}` so `view.js` can pick it up when HubSpot fires `hs-form-event:on-ready`. When inner blocks are present the config also carries `gated`, `postId`, `formId`, `instance`, `restUrl` and `pendingMessage`.

**Success message:** The inner-block HTML is never emitted into the page. On `hs-form-event:on-submission:success`, `view.js` POSTs to `POST /wp-json/hubspot-form-block/v1/unlock` with `postId`, `formId`, `instance` and the submitted email. The endpoint re-parses *that specific post*, locates *that specific form instance* (so the same form ID on different pages returns different content), renders its inner blocks, and returns the HTML, which `view.js` injects into the form container. While verification is in progress the endpoint replies `202` and the client retries with backoff; on repeated failure the `pendingMessage` is shown.

**Gated content (`persistSuccess`):** On first successful unlock the server mints a signed, expiring unlock token and returns it; `view.js` stores `{ path, token }` in a `localStorage` entry keyed `hs-form-submitted:{formId}`. On return visits a small inline `<script>` from `render.php` hides the form (no content is exposed) and `view.js` replays the token to the endpoint, which validates the HMAC and returns the content without contacting HubSpot. Any inner `core/group` block with class `is-hubspot-form-first-submission` (the "First Submission Message" variation) is stripped from the returned HTML on repeat visits but preserved for the fresh-submission path.

## Gated content security

Because HubSpot forms submit client-side, the plugin supports two modes for releasing gated content, selected automatically:

- **Strong mode (recommended)** — when a HubSpot private app access token is configured, the unlock endpoint verifies that a matching, recent submission actually exists in HubSpot (matched by page URL, recency and the submitted email) before returning any content. Content cannot be obtained without genuinely completing the form.
- **Best-effort mode (default, no token)** — the content is still kept out of the page and served from the endpoint, which defeats casual View-Source scraping and bots, but is not a hard guarantee against a determined client that knows the post/form identifiers.

### Configuring the private app token (strong mode)

1. In HubSpot, go to **Settings → Integrations → Private Apps → Create a private app**.
2. Under **Scopes**, grant the **Forms** (read) scope.
3. Create the app and copy the **access token**.
4. Add it to `wp-config.php`:

   ```php
   define( 'HUBSPOT_FORMS_PRIVATE_TOKEN', 'pat-xxxxxxxx-...' );
   ```

   Alternatively, return it from the `hubspot_form_block_private_token` filter. The token is never exposed via the REST API.

Notes:

- The HubSpot API host is always `api.hubapi.com` regardless of the `eu1`/`na1` region setting (region only affects the JS embed hosts).
- Forms placed in block-based theme template parts (outside the post content) can't be located by the unlock endpoint.

## Release workflow

1. Push to `main` → `build-and-release.yml` automatically merges built `build/` into the `release` branch.
2. Create a GitHub Release with a semver tag → `release.yml` replaces the `__VERSION__` placeholder in `hubspot-form-block.php`, commits, retags, and uploads `hubspot-form-block.zip`.
