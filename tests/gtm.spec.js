/**
 * Tests against a live Google Tag Manager container.
 *
 * GTM-MTNXSKGJ is a sandbox container with these tags:
 *
 * - The "Consent Mode (Google tags)" template, setting a default of all
 *   denied on Consent Initialization, and an update of analytics, ads and
 *   functionality granted on `test_consent_template_grant`.
 * - The README's grant tag on `test_consent_template_grant`, which requires
 *   `analytics_storage` and fires after the template's update.
 * - The README's withdrawal tag on `test_consent_withdraw`.
 *
 * The plugin does not read the `dataLayer`. The template sets consent inside
 * GTM, so the plugin only learns about it from the README's tags, which push
 * to `window.hubspotFormBlockConsent`.
 */

/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Internal dependencies
 */
const { stubTracker, settle } = require( './helpers' );

const PORTAL_ID = 148262752;
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';
const CONTAINER_ID = 'GTM-MTNXSKGJ';

const GTM_SNIPPET = `<script>
window.dataLayer = window.dataLayer || [];
window.dataLayer.push( { 'gtm.start': Date.now(), event: 'gtm.js' } );
</script>
<script src="https://www.googletagmanager.com/gtm.js?id=${ CONTAINER_ID }"></script>`;

let postUrl;

/**
 * Writes the plugin's global settings via the REST API.
 *
 * @param {Object} requestUtils The e2e request utils fixture.
 * @param {Object} data         Settings to write.
 */
function setSettings( requestUtils, data ) {
	return requestUtils.rest( {
		path: '/wp/v2/settings',
		method: 'POST',
		data,
	} );
}

/**
 * Opens the test post with GTM loaded as a blocking script at the top of
 * `<head>`, so it runs before the plugin's script in the footer.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openWithGtm( page ) {
	await page.route( postUrl, async ( route ) => {
		const response = await route.fetch();
		const body = ( await response.text() ).replace(
			'<head>',
			`<head>${ GTM_SNIPPET }`
		);
		return route.fulfill( { response, body } );
	} );
	await page.goto( postUrl );

	await page.waitForFunction(
		( id ) => window.google_tag_manager?.[ id ],
		CONTAINER_ID
	);
}

/**
 * Pushes a GTM event.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          event The event name.
 */
function pushEvent( page, event ) {
	return page.evaluate(
		( name ) => window.dataLayer.push( { event: name } ),
		event
	);
}

test.describe( 'HubSpot Form Block with Google Tag Manager', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await setSettings( requestUtils, {
			hubspot_embed_portal_id: PORTAL_ID,
			hubspot_embed_tracking: 'consent',
		} );

		const post = await requestUtils.createPost( {
			title: 'HubSpot GTM test',
			status: 'publish',
			content: `<!-- wp:hubspot/form ${ JSON.stringify( {
				portalId: String( PORTAL_ID ),
				region: 'na1',
				formId: FORM_ID,
			} ) } /-->`,
		} );
		postUrl = post.link;
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await setSettings( requestUtils, {
			hubspot_embed_portal_id: 0,
			hubspot_embed_tracking: 'always',
		} );
	} );

	test( 'the README tags pass on a Consent Mode template grant and withdrawal', async ( {
		page,
	} ) => {
		const requests = await stubTracker( page );
		await openWithGtm( page );
		await settle( page );
		expect( requests ).toHaveLength( 0 );

		await pushEvent( page, 'test_consent_template_grant' );

		await expect.poll( () => requests.length ).toBe( 1 );
		expect( await page.evaluate( () => window._hsp ) ).toContainEqual( [
			'setHubSpotConsent',
			{
				analytics: true,
				advertisement: false,
				functionality: false,
			},
		] );

		await pushEvent( page, 'test_consent_withdraw' );

		await expect
			.poll( () => page.evaluate( () => window._hsp ) )
			.toContainEqual( [ 'revokeCookieConsent' ] );
		const hsq = await page.evaluate( () => window._hsq );
		expect( hsq[ hsq.length - 1 ] ).toEqual( [ 'doNotTrack' ] );
	} );
} );
