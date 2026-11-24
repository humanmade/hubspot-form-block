=== Hubspot Form Block ===
Contributors:      Human Made Limited
Tags:              block, hubspot, forms
Tested up to:      6.9
Requires PHP:      8.2
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

* Load on every page (default): loads the script on every page. If you have turned on HubSpot's own cookie banner, it asks visitors for consent.
* Wait for an external consent banner: loads the script only once your consent banner says the visitor agrees. Choose this if you use a consent plugin, a consent tool in Google Tag Manager, or your own banner.
* Don't load HubSpot tracking: never loads the script.

Which option to pick:

* No consent banner: Load on every page.
* HubSpot's own cookie banner: Load on every page. Turn the banner on in HubSpot under Settings, Privacy & Consent, Cookies. It is available on all HubSpot plans.
* A consent plugin that supports the WP Consent API: Wait for an external consent banner. No other setup.
* A consent tool in Google Tag Manager: Wait for an external consent banner, plus two Custom HTML tags (see below).
* Your own banner, or another consent tool: Wait for an external consent banner, plus one line of JavaScript (see below).

Don't use HubSpot's banner together with another consent banner. Visitors would see two banners.

Developers can change the setting with the `hubspot_form_block_tracking_mode` filter. It receives the saved setting (`always`, `consent` or `never`) and should return one of the same values. Any other value counts as `always`.

How waiting for consent works: the plugin passes consent to HubSpot in three categories: analytics, advertisement and functionality. The script loads once any of them is granted. The plugin turns HubSpot's own cookie banner off and tells HubSpot the choice with `setHubSpotConsent`. HubSpot does no consent management of its own while its banner is off, so this is how it learns which categories are allowed. If analytics is not granted, the plugin also tells HubSpot not to track. When a visitor withdraws analytics, the plugin clears HubSpot's cookies and tells HubSpot to stop tracking. The script can't be unloaded, so it stays on the page until the next page view.

The plugin does not remember consent. Your banner must report the visitor's choice on every page view, not only when they click. Consent plugins that use the WP Consent API do this already. When the sources disagree as the page loads, a denial wins. After that, the latest change wins.

WP Consent API: the plugin reads the WP Consent API and follows its change events. `statistics` maps to HubSpot `analytics`, `marketing` to `advertisement` and `preferences` to `functionality`. The WP Consent API reports consent for everything until a consent banner sets the consent type. The plugin ignores that answer and waits. A banner that sets the type late must use the API's wait-for hook (`window.waitfor_consent_hook`). The plugin also registers HubSpot's cookies with the WP Consent API, so they show in cookie policies built from it.

Google Tag Manager: the plugin doesn't read Google Consent Mode on its own. Add two Custom HTML tags in Google Tag Manager to pass consent on.

The grant tag requires `analytics_storage` under Advanced Settings, Consent Settings. Fire it on All Pages and on your consent tool's consent-update event, so it covers returning visitors and new choices:

`window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];`
`window.hubspotFormBlockConsent.push( { analytics: true } );`

The withdrawal tag fires on your consent tool's consent-update event when analytics is denied. Most tools push the new state with the event, so you can read it with a Data Layer Variable and add it as a trigger condition. Without this tag, a withdrawal takes effect on the next page view:

`window.hubspotFormBlockConsent = window.hubspotFormBlockConsent || [];`
`window.hubspotFormBlockConsent.push( { analytics: false } );`

To pass on advertisement or functionality as well, add the same pair of tags for `ad_storage` with `advertisement`, and for `functionality_storage` with `functionality`.

JavaScript API: any banner can report consent with `window.hubspotFormBlockConsent.push( { analytics, advertisement, functionality } )`. Call it when the page loads with the visitor's saved choice, and again whenever they change it. Each value is a boolean, and you can leave out the ones that did not change. It is safe to call before the plugin script loads.

Things to know:

* When waiting for consent and with Don't load HubSpot tracking, the `hs-script-loader` script handle is not enqueued. Code that dequeues or filters that handle will not see it.
* Before consent, form submissions are not linked to the visitor's earlier page views.
* The forms embed still makes requests to HubSpot's form servers. HubSpot's CDN also sets the `__cf_bm` bot-protection cookie, which is strictly necessary.

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
