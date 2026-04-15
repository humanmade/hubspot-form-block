/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const PORTAL_ID = '148262752';
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';

test.describe( 'HubSpot Form — frontend render', () => {
	test( 'should render form container with correct data attributes', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.setPreferences( 'core/edit-post', {
			welcomeGuide: false,
		} );

		await editor.insertBlock( {
			name: 'hubspot/form',
			attributes: {
				portalId: PORTAL_ID,
				region: 'na1',
				formId: FORM_ID,
			},
		} );

		const postId = await editor.publishPost();
		await page.goto( `/?p=${ postId }` );

		// The container is present in the DOM with the correct attributes.
		// We use toBeAttached (not toBeVisible) because the container is
		// visually hidden until the HubSpot script loads externally.
		const container = page.locator( '.hs-form-html' );
		await expect( container ).toBeAttached();
		await expect( container ).toHaveAttribute(
			'data-portal-id',
			PORTAL_ID
		);
		await expect( container ).toHaveAttribute( 'data-form-id', FORM_ID );
	} );

	test( 'should inject window.hsForms config for the instance', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.setPreferences( 'core/edit-post', {
			welcomeGuide: false,
		} );

		await editor.insertBlock( {
			name: 'hubspot/form',
			attributes: {
				portalId: PORTAL_ID,
				region: 'na1',
				formId: FORM_ID,
			},
		} );

		const postId = await editor.publishPost();
		await page.goto( `/?p=${ postId }` );

		const container = page.locator( '.hs-form-html' );
		await expect( container ).toBeAttached();

		// The inline <script> in render.php sets window.hsForms synchronously,
		// independent of whether the external HubSpot script loads.
		const instanceId = await container.getAttribute( 'id' );
		const config = await page.evaluate(
			( id ) => window.hsForms?.[ id ],
			instanceId
		);

		expect( config ).toBeTruthy();
		expect( config.submitButtonClass ).toContain( 'hs-button' );
	} );
} );
