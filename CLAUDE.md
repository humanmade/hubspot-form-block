# HubSpot Form Block

WordPress block plugin that embeds HubSpot Forms v4 directly in page content. The form renders inline (not iframed) — HubSpot injects DOM into the container element.

## Plugin overview

Single block (`hubspot/form`) that:
- Accepts Portal ID, region, Form ID, redirect URL, submit button text, GTM event name
- Supports optional inner blocks as a success message shown in place of the form after submission
- Emits a `<template>` element server-side containing the inner-block HTML; clones it on submission success via `view.js`

## Architecture

```
src/                    # Source (compiled by @wordpress/scripts → build/)
├── block.json          # Block registration, attributes, supports
├── index.js            # Block registration entry
├── edit.js             # Block editor UI (InspectorControls + inner blocks)
├── save.js             # Saves inner block content (used by render.php)
├── view.js             # Frontend JS: form events, success message clone, GTM
├── render.php          # Server render callback — outputs form container + <template>
├── editor.scss         # Editor-only styles
└── style.scss          # Frontend + editor styles
hubspot-form-block.php  # Plugin entry: registers block, enqueues HubSpot loader script
```

### Key patterns

**Config injection (`render.php`):** Each form instance gets a unique `target` ID (`hubspot-form-{formId}-{n}`). A `<script>` block writes `window.hsForms[target] = {...config}` so `view.js` can pick it up when HubSpot fires `hs-form-event:on-ready`.

**Success message (`render.php` → `view.js`):**
When inner blocks are present and no `redirectUrl` is set, `render.php` emits:
```html
<template id="{target}-inline-message">...inner block HTML...</template>
```
On `hs-form-event:on-submission:success`, `view.js` finds the template by ID and clones its content into the form container, replacing the form with the success message. No sanitization needed — content is server-rendered WordPress block output.

**`WP_HTML_Tag_Processor` usage (`render.php`):** Used to rewrite the outer class on the inner-block wrapper div from `wp-block-hubspot-form` → `wp-block-hubspot-form__inline-message` before placing it in the template.

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
- Block attributes are in `src/block.json`. The `inlineMessage` attribute in `block.json` is legacy (kept for backward-compat migration) — the live success-message mechanism now uses the `<template>` approach, not the `inlineMessage` string.
- `build/` is committed on the `release` branch (via GitHub Actions) but gitignored on `main`.
