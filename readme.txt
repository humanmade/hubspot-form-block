=== Hubspot Form Block ===
Contributors:      Human Made Limited
Tags:              block, hubspot, forms
Tested up to:      6.6
Stable tag:        0.2.2
License:           GPL-2.0-or-later
License URI:       https://www.gnu.org/licenses/gpl-2.0.html

A lightweight Hubspot Form embed block with configuration options.

== Description ==

A basic block for embedding Hubspot forms on your website.

Allows configuring the following settings:

- Portal ID, can be set globally for the and overridden per instance
- Region, can be set globally for the and overridden per instance
- Form ID, multiple instance of the same form are supported
- Redirect URL
- Inline message, overrides redirect URL if provided
- Salesforce campaign key
- GoToWebinar key
- Google Tag Manager event name on submit

Features:

- Built in Google Tag Manager support with customisable form submit event names, default is `hubspot_form_submit`
- Hubspot tracking JS loaded in footer based on global Portal ID setting
- Deferred script loading for performance

Styling forms:

Forms can be styled from within the Hubspot dashboard. Styled forms are loaded in an iframe to ensure they don't conflict with your site styles. If you wish to remove all hubspot styling and load the form directly on the page, so that any site form styling is applied, select the option "Set as raw HTML form" in the Hubspot form styles settings page. 

== Installation ==

This section describes how to install the plugin and get it working.

e.g.

1. Upload the plugin files to the `/wp-content/plugins/hubspot-form-block` directory, or install the plugin through the WordPress plugins screen directly.
1. Activate the plugin through the 'Plugins' screen in WordPress


== Changelog ==

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
