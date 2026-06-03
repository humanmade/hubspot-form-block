=== Hubspot Form Block ===
Contributors:      Human Made Limited
Tags:              block, hubspot, forms
Tested up to:      6.9
Stable tag:        0.6.0
License:           GPL-2.0-or-later
License URI:       https://www.gnu.org/licenses/gpl-2.0.html

A lightweight Hubspot Form embed block with configuration options.

== Description ==

A basic block for embedding Hubspot forms on your website.

NOTE: This is using the Hubspot Forms v4 API.

Allows configuring the following settings:

- Portal ID, can be set globally for the and overridden per instance
- Region, can be set globally for the and overridden per instance
- Form ID, multiple instance of the same form are supported
- Redirect URL
- Inline message, overrides redirect URL if provided
- Google Tag Manager event name on submit

Features:

- Built in Google Tag Manager support with customisable form submit event names, default is `hubspot_form_submit`
- Hubspot tracking JS loaded in footer based on global Portal ID setting
- Deferred script loading for performance

Styling forms:

Forms can be styled from within the Hubspot dashboard, or by overriding the CSS variables defined on this page.

https://developers.hubspot.com/docs/cms/start-building/features/forms/forms#define-custom-styling-for-embedded-forms-using-css

== Installation ==

This section describes how to install the plugin and get it working.

e.g.

1. Upload the plugin files to the `/wp-content/plugins/hubspot-form-block` directory, or install the plugin through the WordPress plugins screen directly.
1. Activate the plugin through the 'Plugins' screen in WordPress


== Changelog ==

= 0.6.0 =
* Add: Gated success content is now fetched from a REST endpoint (`/hubspot-form-block/v1/unlock`) after submission instead of being embedded in the page — the content can no longer be read from the page source without submitting the form
* Add: Strong gating mode — configure a HubSpot private app access token (`HUBSPOT_FORMS_PRIVATE_TOKEN` constant or `hubspot_form_block_private_token` filter) and the server verifies a real submission against HubSpot's Submissions API before releasing the content
* Add: Best-effort mode (no token) keeps content out of the page source as a sensible default
* Add: Signed, expiring unlock tokens so returning visitors with gated content enabled see it again without re-submitting; per-IP rate limiting and transient caching on the endpoint
* Update: `view.js` fetches and injects the success message (polling with backoff while verification is pending) and shows a graceful pending message on failure
* Remove: The server-rendered `<template>` success-message element and the localStorage pre-swap clone

= 0.5.0 =
* Add: Inner blocks as inline success message — add any WordPress blocks (paragraphs, images, embeds, etc.) directly inside the form block; they replace the form after successful submission
* Add: Playwright end-to-end test suite covering block registration, form rendering, and inline success message behaviour
* Add: WordPress Playground local development environment (`npm run playground:start`)
* Add: GitHub Actions CI workflows for automated testing on push
* Update: Success message now uses a `<template>` element approach — server-rendered block HTML is preserved exactly, including embedded iframes, without client-side sanitization
* Remove: Legacy `inlineMessage` string attribute (template-based inner blocks replace it; existing content migrates automatically)

= 0.4.0 =
* Add: `hubspot_form_block_trusted_iframe_hosts` filter to allow `<iframe>` elements from trusted host domains inside the inline success message. Defaults to an empty array (no behaviour change). Useful for embedding YouTube/Vimeo videos in post-submission content.

= 0.3.0 =
* Update: Upgraded to Hubspot Forms v4 API

= 0.2.2 =
* Fix: `wp-scripts` version

= 0.2.1=
* Fix: `composer/installers` version

= 0.2.0 =
* Add: Support for HTML/inner blocks inline message

= 0.1.3 =
* Fix: Submit button class

= 0.1.2 =
* Fix: Custom event detail name

= 0.1.1 =
* Fix: Instance ID handling

= 0.1.0 =
* Release
