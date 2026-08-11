/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Internal dependencies
 */
const { editorCanvas } = require( './helpers' );

const PORTAL_ID = 148262752;
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';

// 0 is the "unset" value for the ID options — the plugin treats it as empty and
// the editor falls back to a blank placeholder. Writing null instead would fail
// with rest_invalid_stored_value whenever the option already has a value.
const EMPTY_GLOBALS = {
	hubspot_embed_portal_id: 0,
	hubspot_embed_business_unit_id: 0,
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
 * Writes the plugin's global settings via the REST API.
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
 * The panel's initialOpen depends on whether a global Portal ID is set, so it is
 * expanded explicitly rather than assumed.
 *
 * @param {Object} admin      The e2e admin fixture.
 * @param {Object} editor     The e2e editor fixture.
 * @param {Object} page       The Playwright page.
 * @param {Object} attributes Block attributes to insert with.
 */
async function insertBlockAndOpenGlobalSettings(
	admin,
	editor,
	page,
	attributes = {}
) {
	await admin.createNewPost();
	await editor.setPreferences( 'core/edit-post', { welcomeGuide: false } );
	await editor.insertBlock( { name: 'hubspot/form', attributes } );
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

	test( 'saving a Business Unit ID leaves an existing global Portal ID intact', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		// A Portal ID saved earlier, as in the reported sequence.
		await setGlobals( requestUtils, {
			hubspot_embed_portal_id: PORTAL_ID,
		} );

		await insertBlockAndOpenGlobalSettings( admin, editor, page );

		// The saved global is offered as the placeholder, so the field is left
		// blank — only the Business Unit ID is entered.
		const portalInput = page.getByLabel( 'Portal ID' );
		await expect( portalInput ).toHaveValue( '' );
		await expect( portalInput ).toHaveAttribute(
			'placeholder',
			String( PORTAL_ID )
		);

		await page.getByLabel( 'Business Unit ID' ).fill( '99' );
		await page
			.getByRole( 'button', { name: 'Set as global defaults' } )
			.click();

		await expect
			.poll(
				async () => ( await getGlobals( requestUtils ) ).businessUnitId
			)
			.toBe( 99 );

		// The blank Portal ID field must not have disturbed the saved global.
		const globals = await getGlobals( requestUtils );
		expect( globals.portalId ).toBe( PORTAL_ID );
		expect( globals.region ).toBe( 'eu1' );
	} );

	test( 'saving a Portal ID on its own stores just that setting', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		await insertBlockAndOpenGlobalSettings( admin, editor, page );

		await page.getByLabel( 'Portal ID' ).fill( String( PORTAL_ID ) );
		await page
			.getByRole( 'button', { name: 'Set as global defaults' } )
			.click();

		await expect
			.poll( async () => ( await getGlobals( requestUtils ) ).portalId )
			.toBe( PORTAL_ID );

		// The untouched Business Unit ID was never sent, so it stays unset.
		const globals = await getGlobals( requestUtils );
		expect( globals.businessUnitId ).toBe( 0 );
	} );

	test( 'saving a global setting does not reset a non-default region', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		await setGlobals( requestUtils, { hubspot_embed_region: 'na1' } );

		await insertBlockAndOpenGlobalSettings( admin, editor, page );

		await page.getByLabel( 'Portal ID' ).fill( String( PORTAL_ID ) );
		await page
			.getByRole( 'button', { name: 'Set as global defaults' } )
			.click();

		await expect
			.poll( async () => ( await getGlobals( requestUtils ) ).portalId )
			.toBe( PORTAL_ID );

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

		await portalInput.fill( String( PORTAL_ID ) );
		await expect( saveButton ).toBeVisible();

		// Clearing the field again leaves nothing to promote, so there is no way
		// to submit a blank value over a saved global.
		await portalInput.fill( '' );
		await expect( saveButton ).toBeHidden();
	} );

	test( 'a block-level Portal ID satisfies the editor notice without a global', async ( {
		admin,
		editor,
		page,
	} ) => {
		await insertBlockAndOpenGlobalSettings( admin, editor, page, {
			portalId: PORTAL_ID,
			formId: FORM_ID,
		} );

		// No global Portal ID is set, but the block supplies its own, so the
		// setup prompt must not be shown.
		const block = editorCanvas( page ).getByRole( 'document', {
			name: 'Block: Hubspot Form',
		} );
		await expect(
			block.getByText( /Please preview your changes/i )
		).toBeVisible();
		await expect( block.getByText( /Portal ID.*Form ID/i ) ).toBeHidden();
	} );
} );
