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

- **Load on every page** (default): loads the script on every page. If you have turned on HubSpot's own cookie banner, it asks visitors for consent.
- **Wait for an external consent banner**: loads the script only once your consent banner says the visitor agrees. Choose this if you use a consent plugin, a consent tool in Google Tag Manager, or your own banner.
- **Don't load HubSpot tracking**: never loads the script.

Which option to pick:

| Your setup | Option | Extra setup |
|---|---|---|
| No consent banner | Load on every page | None |
| HubSpot's own cookie banner | Load on every page | Turn the banner on in HubSpot under Settings → Privacy & Consent → Cookies. It is available on all HubSpot plans. |
| A consent plugin that supports the WP Consent API | Wait for an external consent banner | None |
| A consent tool in Google Tag Manager | Wait for an external consent banner | Two Custom HTML tags. See [Google Tag Manager](#google-tag-manager). |
| Your own banner, or another consent tool | Wait for an external consent banner | One line of JavaScript. See [JavaScript API](#javascript-api). |

Don't use HubSpot's banner together with another consent banner. Visitors would see two banners.

Developers can change the setting with the `hubspot_form_block_tracking_mode` filter. It receives the saved setting (`always`, `consent` or `never`) and should return one of the same values. Any other value counts as `always`.

### How waiting for consent works

The plugin passes consent to HubSpot in three categories: analytics, advertisement and functionality. The script loads once any of them is granted. The plugin turns HubSpot's own cookie banner off and tells HubSpot the choice with `setHubSpotConsent`. HubSpot does no consent management of its own while its banner is off, so this is how it learns which categories are allowed. If analytics is not granted, the plugin also tells HubSpot not to track.

When a visitor withdraws analytics, the plugin clears HubSpot's cookies and tells HubSpot to stop tracking. The script can't be unloaded, so it stays on the page until the next page view. The plugin can only clear HubSpot's cookies on a page where HubSpot has loaded. If a visitor withdraws consent somewhere else, for example on a later page before HubSpot loads, cookies from earlier visits stay until they expire.

The plugin does not remember consent. Your banner must report the visitor's choice on every page view, not only when they click. Consent plugins that use the WP Consent API do this already.

When the sources disagree as the page loads, a denial wins. After that, the latest change wins.

### WP Consent API

The plugin reads the [WP Consent API](https://wordpress.org/plugins/wp-consent-api/) and follows its change events. It maps the categories like this:

| WP Consent API | HubSpot |
|---|---|
| `statistics` | `analytics` |
| `marketing` | `advertisement` |
| `preferences` | `functionality` |

The WP Consent API reports consent for everything until a consent banner sets the consent type. The plugin ignores that answer and waits. A banner that sets the type late must use the API's wait-for hook (`window.waitfor_consent_hook`).

The plugin also registers HubSpot's cookies with the WP Consent API, so they show in cookie policies built from it.

### Google Tag Manager

The plugin doesn't read Google Consent Mode on its own. Add two Custom HTML tags in Google Tag Manager to pass consent on.

The grant tag. Under **Advanced Settings → Consent Settings**, require `analytics_storage`. Fire it on **All Pages** and on your consent tool's consent-update event. All Pages covers returning visitors when the tool restores their choice before tags fire. The update event covers new choices, and tools that restore the choice later.

```html
<script>
window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];
window.hubspotFormBlockConsent.push( { analytics: true } );
</script>
```

The withdrawal tag. Fire it on your consent tool's consent-update event when analytics is denied. Most tools push the new state with the event, so you can read it with a Data Layer Variable and add it as a trigger condition. Without this tag, a withdrawal takes effect on the next page view.

```html
<script>
window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];
window.hubspotFormBlockConsent.push( { analytics: false } );
</script>
```

To pass on advertisement or functionality as well, add the same pair of tags for `ad_storage` with `advertisement`, and for `functionality_storage` with `functionality`.

### JavaScript API

Any banner can report consent with `window.hubspotFormBlockConsent.push()`. Call it when the page loads with the visitor's saved choice, and again whenever they change it:

```js
window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];
window.hubspotFormBlockConsent.push( {
	analytics: true,
	advertisement: false,
	functionality: true,
} );
```

Each value is a boolean, and you can leave out the ones that did not change. It is safe to call before the plugin script loads.

### Things to know

- When waiting for consent and with Don't load HubSpot tracking, the `hs-script-loader` script handle is not enqueued. Code that dequeues or filters that handle will not see it.
- Before consent, form submissions are not linked to the visitor's earlier page views.
- The forms embed still makes requests to HubSpot's form servers. HubSpot's CDN also sets the `__cf_bm` bot-protection cookie, which is strictly necessary.

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
