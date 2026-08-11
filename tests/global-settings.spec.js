/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const EMPTY_GLOBALS = {
	hubspot_embed_portal_id: null,
	hubspot_embed_business_unit_id: null,
	hubspot_embed_region: 'eu1',
};

/**
 * Reads the plugin's global settings from the REST API.
 *
 * @param {Object} requestUtils The e2e request utils fixture.
 * @return {Promise<Object>} The HubSpot embed settings.
 */
async function getGlobals( requestUtils ) {
	const settings = await requestUtils.rest( { path: '/wp/v2/settings' } );
	return {
		portalId: settings.hubspot_embed_portal_id,
		businessUnitId: settings.hubspot_embed_business_unit_id,
		region: settings.hubspot_embed_region,
	};
}

/**
 * Writes the plugin's global settings via the REST API. A null value deletes
 * the underlying option.
 *
 * @param {Object} requestUtils The e2e request utils fixture.
 * @param {Object} data         Settings to write.
 */
async function setGlobals( requestUtils, data ) {
	await requestUtils.rest( {
		path: '/wp/v2/settings',
		method: 'POST',
		data,
	} );
}

/**
 * Inserts the block and reveals its "Global Settings" panel in the inspector.
 *
 * @param {Object} admin  The e2e admin fixture.
 * @param {Object} editor The e2e editor fixture.
 * @param {Object} page   The Playwright page.
 */
async function insertBlockAndOpenGlobalSettings( admin, editor, page ) {
	await admin.createNewPost();
	await editor.setPreferences( 'core/edit-post', { welcomeGuide: false } );
	await editor.insertBlock( { name: 'hubspot/form' } );
	await editor.openDocumentSettingsSidebar();

	const blockTab = page.getByRole( 'tab', { name: 'Block' } );
	if ( await blockTab.isVisible() ) {
		await blockTab.click();
	}

	const panelToggle = page.getByRole( 'button', { name: 'Global Settings' } );
	await expect( panelToggle ).toBeVisible();
	if ( ( await panelToggle.getAttribute( 'aria-expanded' ) ) === 'false' ) {
		await panelToggle.click();
	}
}

test.describe( 'HubSpot Form Block global settings', () => {
	test.beforeEach( async ( { requestUtils } ) => {
		await setGlobals( requestUtils, EMPTY_GLOBALS );
	} );

	test.afterEach( async ( { requestUtils } ) => {
		await setGlobals( requestUtils, EMPTY_GLOBALS );
	} );

	test( 'saving one global setting leaves the others intact', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		await insertBlockAndOpenGlobalSettings( admin, editor, page );

		const portalInput = page.getByLabel( 'Portal ID' );
		const saveButton = page.getByRole( 'button', {
			name: 'Set as global defaults',
		} );

		// Save a global Portal ID on its own.
		await portalInput.fill( '148262752' );
		await saveButton.click();

		await expect
			.poll( async () => ( await getGlobals( requestUtils ) ).portalId )
			.toBe( 148262752 );

		// The block-level override is cleared once promoted to a global, so the
		// field falls back to showing the saved value as its placeholder.
		await expect( portalInput ).toHaveValue( '' );
		await expect( portalInput ).toHaveAttribute(
			'placeholder',
			'148262752'
		);

		// Now save only a Business Unit ID, leaving Portal ID blank.
		await page.getByLabel( 'Business Unit ID' ).fill( '99' );
		await saveButton.click();

		await expect
			.poll(
				async () => ( await getGlobals( requestUtils ) ).businessUnitId
			)
			.toBe( 99 );

		// The previously saved Portal ID must survive.
		const globals = await getGlobals( requestUtils );
		expect( globals.portalId ).toBe( 148262752 );
		expect( globals.region ).toBe( 'eu1' );
	} );

	test( 'saving a global setting does not reset a non-default region', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		await setGlobals( requestUtils, { hubspot_embed_region: 'na1' } );

		await insertBlockAndOpenGlobalSettings( admin, editor, page );

		await page.getByLabel( 'Portal ID' ).fill( '148262752' );
		await page
			.getByRole( 'button', { name: 'Set as global defaults' } )
			.click();

		await expect
			.poll( async () => ( await getGlobals( requestUtils ) ).portalId )
			.toBe( 148262752 );

		// The region was never touched in the sidebar, so it must be left alone
		// rather than reset to the block attribute default.
		const globals = await getGlobals( requestUtils );
		expect( globals.region ).toBe( 'na1' );
	} );

	test( 'the save button only appears once a global value is entered', async ( {
		admin,
		editor,
		page,
	} ) => {
		await insertBlockAndOpenGlobalSettings( admin, editor, page );

		const portalInput = page.getByLabel( 'Portal ID' );
		const saveButton = page.getByRole( 'button', {
			name: 'Set as global defaults',
		} );
		await expect( saveButton ).toBeHidden();

		await portalInput.fill( '148262752' );
		await expect( saveButton ).toBeVisible();

		// Clearing the field again leaves nothing to promote, so there is no
		// way to submit a blank value over a saved global.
		await portalInput.fill( '' );
		await expect( saveButton ).toBeHidden();
	} );
} );
