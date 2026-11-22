=== Hubspot Form Block ===
Contributors:      Human Made Limited
Tags:              block, hubspot, forms
Tested up to:      6.9
Stable tag:        0.5.0
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

= Consent and tracking =

Forms always load. The tracking setting controls only HubSpot's tracking script (hs-scripts.com), which also carries HubSpot's chat, cookie banner and ads features. Set it in the block inspector under Global Settings, HubSpot tracking.

* Automatic (default): waits for consent when the WP Consent API plugin is active, and otherwise loads on every page.
* Wait for consent: loads the script once the visitor consents.
* Load on every page: always loads the script.
* Don't load: never loads the script.

Developers can change the resolved mode with the `hubspot_form_block_tracking_mode` filter. It receives `consent`, `always` or `never`.

When waiting for consent, the script loads once any of HubSpot's three categories (analytics, advertisement, functionality) is granted. HubSpot's own cookie banner is turned off, and the plugin passes the choice to HubSpot with `setHubSpotConsent`. If analytics is not granted, the plugin also tells HubSpot not to track. Withdrawing analytics clears HubSpot's cookies.

The categories map like this:

* WP Consent API `statistics` and Google Consent Mode `analytics_storage` map to HubSpot `analytics`.
* WP Consent API `marketing` and Google Consent Mode `ad_storage` map to HubSpot `advertisement`.
* WP Consent API `preferences` and Google Consent Mode `functionality_storage` map to HubSpot `functionality`.

The plugin registers HubSpot's cookies with the WP Consent API, so they show in cookie policies built from it.

Google Consent Mode: the plugin reads `gtag( 'consent', ... )` commands from the `dataLayer`. Region-scoped commands only count when they deny consent, because the visitor's region is unknown. Some consent tools use Google Tag Manager consent templates and may not write to the `dataLayer`. For these, add a GTM Custom HTML tag that requires `analytics_storage` consent (under Additional consent checks) and fires on consent update, with this code:

`window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];`
`window.hubspotFormBlockConsent.push( { analytics: true } );`

JavaScript API: a custom consent banner can report consent with `window.hubspotFormBlockConsent.push( { analytics, advertisement, functionality } )`. Each value is a boolean, and you can leave out the ones that did not change. It is safe to call before the plugin script loads. Explicit choices override defaults: JavaScript API entries, Google Consent Mode updates, and WP Consent API values once a banner sets the consent type. Google Consent Mode defaults never override an explicit choice, and region-scoped default denials beat global defaults. At start-up the plugin reads the sources in a fixed order: the JavaScript API queue, Google Consent Mode, then the WP Consent API. After that the most recent explicit change wins.

Things to know:

* In consent and never modes the `hs-script-loader` script handle is not enqueued. Code that dequeues or filters that handle will not see it.
* Before consent, form submissions are not linked to the visitor's earlier page views.
* The forms embed still makes requests to HubSpot's form servers. HubSpot's CDN also sets the `__cf_bm` bot-protection cookie, which is strictly necessary.
* The WP Consent API reports consent for everything until a banner sets the consent type. A banner that sets it late must use the API's wait-for hook (`window.waitfor_consent_hook`).

Styling forms:

Forms can be styled from within the Hubspot dashboard, or by overriding the CSS variables defined on this page.

https://developers.hubspot.com/docs/cms/start-building/features/forms/forms#define-custom-styling-for-embedded-forms-using-css

== Installation ==

This section describes how to install the plugin and get it working.

e.g.

1. Upload the plugin files to the `/wp-content/plugins/hubspot-form-block` directory, or install the plugin through the WordPress plugins screen directly.
1. Activate the plugin through the 'Plugins' screen in WordPress


== Changelog ==

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
