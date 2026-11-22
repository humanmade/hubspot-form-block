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

* Automatic (default): waits for consent when the WP Consent API plugin is active, and otherwise loads on every page. If the WP Consent API is active but no banner sets a consent type, Automatic treats that as no banner and loads HubSpot.
* Wait for consent: loads the script once the visitor consents. It ignores the WP Consent API's answer when no banner sets a consent type, and only loads after an explicit grant. Choose this if your banner is based on Google Tag Manager.
* Load on every page: always loads the script.
* Don't load: never loads the script.

Developers can change the resolved mode with the `hubspot_form_block_tracking_mode` filter. It receives the setting (`auto`, `consent`, `always` or `never`) before `auto` is resolved, and accepts the same values back. Unknown values behave like `auto`.

When waiting for consent, the script loads once any of HubSpot's three categories (analytics, advertisement, functionality) is granted. HubSpot's own cookie banner is turned off, and the plugin passes the choice to HubSpot with `setHubSpotConsent`. If analytics is not granted, the plugin also tells HubSpot not to track. Withdrawing analytics clears HubSpot's cookies. The tracker can't be unloaded once it has loaded. A later denial stops tracking, because the plugin tells HubSpot not to track and clears its cookies, but the script stays on the page until the next page view.

The categories map like this:

* WP Consent API `statistics` and Google Consent Mode `analytics_storage` map to HubSpot `analytics`.
* WP Consent API `marketing` and Google Consent Mode `ad_storage` map to HubSpot `advertisement`.
* WP Consent API `preferences` and Google Consent Mode `functionality_storage` map to HubSpot `functionality`.

The plugin registers HubSpot's cookies with the WP Consent API, so they show in cookie policies built from it.

Google Consent Mode: the plugin reads `gtag( 'consent', ... )` commands from the `dataLayer`. Region-scoped commands only count when they deny consent, because the visitor's region is unknown. Some consent tools use Google Tag Manager consent templates and may not write to the `dataLayer`. For these, add a GTM Custom HTML tag that requires `analytics_storage` consent (under Additional consent checks) and fires on consent update, with this code:

`window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];`
`window.hubspotFormBlockConsent.push( { analytics: true } );`

To pass on a withdrawal, add a second Custom HTML tag. Fire it from your consent tool's withdrawal or consent-update event when `analytics_storage` is denied. For example, use a trigger on the tool's `dataLayer` event with a variable condition. The tag pushes the opposite value:

`window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];`
`window.hubspotFormBlockConsent.push( { analytics: false } );`

Without this tag, a withdrawal takes effect on the next page view when the plugin is set to **Wait for consent**, because the grant tag no longer fires. With Automatic and the WP Consent API active but no banner setting a consent type, HubSpot would load anyway.

JavaScript API: a custom consent banner can report consent with `window.hubspotFormBlockConsent.push( { analytics, advertisement, functionality } )`. Each value is a boolean, and you can leave out the ones that did not change. It is safe to call before the plugin script loads.

When sources disagree, the plugin ranks them, and a higher rank wins whatever order the sources arrive in. Explicit choices rank highest: JavaScript API entries, Google Consent Mode updates, and the WP Consent API once a banner sets a consent type. A region-scoped Google Consent Mode default denial ranks next, then a global Google Consent Mode default. The weakest is the WP Consent API's "everything allowed" answer when no banner sets a consent type. At start-up, each source is read in its own order first, and when sources of equal rank disagree, denial wins. After that, the most recent change wins.

A region-scoped default denial applies to every visitor, because the plugin cannot know the visitor's region. On a "deny in the EEA, grant elsewhere" setup, visitors outside the region are not tracked until the banner sends an update or the GTM tag calls the JavaScript API.

Things to know:

* In consent and never modes the `hs-script-loader` script handle is not enqueued. Code that dequeues or filters that handle will not see it.
* Before consent, form submissions are not linked to the visitor's earlier page views.
* The forms embed still makes requests to HubSpot's form servers. HubSpot's CDN also sets the `__cf_bm` bot-protection cookie, which is strictly necessary.
* The WP Consent API reports consent for everything until a banner sets the consent type. With Automatic, that counts as no banner. With Wait for consent, it is ignored. A banner that sets it late must use the API's wait-for hook (`window.waitfor_consent_hook`).

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
