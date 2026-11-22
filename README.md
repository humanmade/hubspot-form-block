# HubSpot Form Block

A WordPress block plugin that embeds HubSpot Forms v4 directly in page content. Forms render inline (not iframed) — HubSpot injects DOM into the container element.

## Features

- **HubSpot Forms v4 API** — uses the modern developer embed API
- **Inline success message** — add any WordPress blocks as the post-submission message; shown in place of the form after submission
- **Gated content** — optionally remember submissions in the browser (per page URL) and show the success content immediately on return visits, hiding the form permanently; supports a "First Submission Message" block for content only shown at the moment of first submission
- **Global settings** — set Portal ID and region site-wide; override per block instance
- **Google Tag Manager** — fires a configurable dataLayer event on submission (default: `hubspot_form_submit`)
- **Deferred script loading** — HubSpot tracking JS loaded asynchronously in the footer
- **Custom submit button text** — override the form's submit button label per block instance
- **Redirect on submit** — optionally redirect to a URL instead of showing an inline message
- **Multiple instances** — multiple instances of the same form on a single page are fully supported
- **Legacy form support** for forms built in HubSpot's older forms editor, which the v4 embed cannot load

## Block settings

| Setting | Description |
|---|---|
| Portal ID | HubSpot portal ID. Can be set as a global default and overridden per block. |
| Region | `eu1` (Europe) or `na1` (North America). Can be set as a global default. |
| Form ID | HubSpot form ID. |
| Redirect URL | Redirect to this URL after submission. Overrides the inline message if set. |
| Submit button text | Override the form's submit button label. |
| GTM event name | dataLayer event name pushed on submission. Defaults to `hubspot_form_submit`. |
| Success message (inner blocks) | WordPress blocks shown in place of the form after successful submission. Not shown if a redirect URL is set. |
| Use the legacy form embed | Loads the form through HubSpot's older embed script instead of the v4 developer embed. Turn this on for a form built in HubSpot's older forms editor, which the v4 render definition endpoint reports as "Form not found". Off by default. |
| Enable gated content | When on, the browser remembers that this form has been submitted on this page (stored in `localStorage`). Returning visitors see the success message immediately instead of the form. Use the "Insert First Submission Message" button to add a block whose content is only shown at the moment of the first submission — stripped on subsequent visits. Disabled when a redirect URL is set. |

## Global settings

Portal ID and region can be set globally via **Settings → General** in the WordPress admin (or via the REST API at `/wp-json/wp/v2/settings`). Individual block instances can override these values. Admins can promote per-block values to global defaults using the "Set as global defaults" button in the block sidebar.

## Consent and tracking

Forms always load. The tracking setting controls only HubSpot's tracking script (`hs-scripts.com`). That script also carries HubSpot's chat, cookie banner and ads features. Set it in the block inspector under **Global Settings → HubSpot tracking**.

- **Automatic** (default): waits for consent when the WP Consent API plugin is active, and otherwise loads on every page.
- **Wait for consent**: loads the script once the visitor consents.
- **Load on every page**: always loads the script.
- **Don't load**: never loads the script.

Developers can change the resolved mode with the `hubspot_form_block_tracking_mode` filter. It receives `consent`, `always` or `never`.

When waiting for consent, the script loads once any of HubSpot's three categories (analytics, advertisement, functionality) is granted. HubSpot's own cookie banner is turned off, and the plugin passes the choice to HubSpot with `setHubSpotConsent`. If analytics is not granted, the plugin also tells HubSpot not to track. Withdrawing analytics clears HubSpot's cookies.

| WP Consent API | Google Consent Mode | HubSpot |
|---|---|---|
| `statistics` | `analytics_storage` | `analytics` |
| `marketing` | `ad_storage` | `advertisement` |
| `preferences` | `functionality_storage` | `functionality` |

The plugin registers HubSpot's cookies with the WP Consent API, so they show in cookie policies built from it.

### Google Consent Mode

The plugin reads `gtag( 'consent', ... )` commands from the `dataLayer`. Region-scoped commands only count when they deny consent, because the visitor's region is unknown.

Some consent tools use Google Tag Manager consent templates and may not write to the `dataLayer`. For these, add a GTM Custom HTML tag that requires `analytics_storage` consent (under Additional consent checks) and fires on consent update:

```html
<script>
window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];
window.hubspotFormBlockConsent.push( { analytics: true } );
</script>
```

### JavaScript API

A custom consent banner can report consent with `window.hubspotFormBlockConsent.push( { analytics, advertisement, functionality } )`. Each value is a boolean, and you can leave out the ones that did not change. It is safe to call before the plugin script loads.

When sources disagree, the plugin ranks them, and a higher rank wins whatever order the sources arrive in. Explicit choices rank highest: JavaScript API entries, Google Consent Mode updates, and the WP Consent API once a banner sets a consent type. A region-scoped Google Consent Mode default denial ranks next, then a global Google Consent Mode default. The weakest is the WP Consent API's "everything allowed" answer when no banner sets a consent type. Between sources of equal rank, the most recent change wins.

A region-scoped default denial applies to every visitor, because the plugin cannot know the visitor's region. On a "deny in the EEA, grant elsewhere" setup, visitors outside the region are not tracked until the banner sends an update or the GTM tag calls the JavaScript API.

### Things to know

- In consent and never modes the `hs-script-loader` script handle is not enqueued. Code that dequeues or filters that handle will not see it.
- Before consent, form submissions are not linked to the visitor's earlier page views.
- The forms embed still makes requests to HubSpot's form servers. HubSpot's CDN also sets the `__cf_bm` bot-protection cookie, which is strictly necessary.
- The WP Consent API reports consent for everything until a banner sets the consent type. A banner that sets it late must use the API's wait-for hook (`window.waitfor_consent_hook`).

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
├── view.js             # Frontend JS: form events, success message, GTM
├── render.php          # Server render: form container + <template> for success message
├── editor.scss         # Editor-only styles
└── style.scss          # Frontend + editor styles
hubspot-form-block.php  # Plugin entry: block registration, script enqueue, settings API
```

**Config injection:** Each form instance gets a unique target ID (`hubspot-form-{formId}-{n}`). A `<script>` block writes `window.hsForms[target] = {...config}` so `view.js` can pick it up when HubSpot fires `hs-form-event:on-ready`.

**Success message:** When inner blocks are present and no redirect URL is set, `render.php` emits a `<template id="{target}-inline-message">` containing the server-rendered block HTML. On `hs-form-event:on-submission:success`, `view.js` clones the template content into the form container, replacing the form with the success message.

**Legacy embed (`legacyEmbed`):** HubSpot's v4 developer embed finds its own containers and fires `hs-form-event:*` events. It answers `Form not found` for forms built in the older forms editor, and deliberately does not fall back in that case. With `legacyEmbed` on, `render.php` loads `forms/embed/v2.js` instead, marks the container `hs-form-legacy` so the v4 loader ignores it, and adds the portal, form and region to the injected config. `view.js` then calls `hbspt.forms.create` for each legacy config, queued through `window.hsFormsOnReady` so the order the script and the config arrive in does not matter, and wires the same submit button, GTM, success message and gated content behaviour onto the `onFormReady` and `onFormSubmitted` callbacks. The legacy embed renders `<input type="submit">` rather than a `<button>`, so a custom submit label is set on `value`.

**Gated content (`persistSuccess`):** When enabled, `view.js` writes the current `window.location.pathname` into a `localStorage` entry keyed `hs-form-submitted:{formId}` (value is a JSON array of paths, so the same form on different URLs is tracked independently). A synchronous inline `<script>` emitted by `render.php` checks this array on page load and pre-swaps the container before paint if the current path is present, preventing HubSpot from rendering the form at all. Any inner `core/group` block with class `is-hubspot-form-first-submission` (the "First Submission Message" variation) is stripped from the clone during pre-swap but preserved for the fresh-submission path.

## Release workflow

1. Push to `main` → `build-and-release.yml` automatically merges built `build/` into the `release` branch.
2. Manually run the **Version and Release** workflow (`release.yml`) from the Actions tab (`workflow_dispatch`), entering the version number (e.g. `1.2.3`, without a leading `v`). It replaces the `__VERSION__` placeholder in `hubspot-form-block.php`, builds, creates the `v{version}` tag, and publishes a GitHub Release with `hubspot-form-block.zip` attached. The tag is created fresh from the version-bumped build — no retag or force-push.
