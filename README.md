# HubSpot Form Block

A WordPress block plugin that embeds HubSpot Forms v4 directly in page content. Forms render inline (not iframed) — HubSpot injects DOM into the container element.

## Features

- **HubSpot Forms v4 API** — uses the modern developer embed API
- **Inline success message** — add any WordPress blocks as the post-submission message; shown in place of the form after submission
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
| Success message (inner blocks) | WordPress blocks shown in place of the form after successful submission. Not shown if a redirect URL is set. |

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
├── view.js             # Frontend JS: form events, success message, GTM
├── render.php          # Server render: form container + <template> for success message
├── editor.scss         # Editor-only styles
└── style.scss          # Frontend + editor styles
hubspot-form-block.php  # Plugin entry: block registration, script enqueue, settings API
```

**Config injection:** Each form instance gets a unique target ID (`hubspot-form-{formId}-{n}`). A `<script>` block writes `window.hsForms[target] = {...config}` so `view.js` can pick it up when HubSpot fires `hs-form-event:on-ready`.

**Success message:** When inner blocks are present and no redirect URL is set, `render.php` emits a `<template id="{target}-inline-message">` containing the server-rendered block HTML. On `hs-form-event:on-submission:success`, `view.js` clones the template content into the form container, replacing the form with the success message.

## Release workflow

1. Push to `main` → `build-and-release.yml` automatically merges built `build/` into the `release` branch.
2. Create a GitHub Release with a semver tag → `release.yml` replaces the `__VERSION__` placeholder in `hubspot-form-block.php`, commits, retags, and uploads `hubspot-form-block.zip`.
