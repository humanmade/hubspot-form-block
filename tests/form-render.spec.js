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
		requestUtils,
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

		// The form container should be present with the right data attributes.
		const container = page.locator( '.hs-form-html' );
		await expect( container ).toBeVisible();
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

		// Confirm the inline config script set window.hsForms for this instance.
		const container = page.locator( '.hs-form-html' );
		await expect( container ).toBeVisible();

		const instanceId = await container.getAttribute( 'id' );
		const config = await page.evaluate(
			( id ) => window.hsForms?.[ id ],
			instanceId
		);

		expect( config ).toBeTruthy();
		expect( config.submitButtonClass ).toContain( 'hs-button' );
	} );
} );
