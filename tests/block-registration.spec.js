/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Internal dependencies
 */
const { editorCanvas } = require( './helpers' );

test.describe( 'HubSpot Form Block', () => {
	test( 'should be registered and insertable', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.setPreferences( 'core/edit-post', {
			welcomeGuide: false,
		} );

		await editor.insertBlock( { name: 'hubspot/form' } );

		const blocks = await editor.getBlocks();
		expect( blocks ).toHaveLength( 1 );
		expect( blocks[ 0 ].name ).toBe( 'hubspot/form' );
	} );

	test( 'should show setup prompt when portal/form ID not set', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.setPreferences( 'core/edit-post', {
			welcomeGuide: false,
		} );

		await editor.insertBlock( { name: 'hubspot/form' } );

		const block = editorCanvas( page ).getByRole( 'document', {
			name: 'Block: Hubspot Form',
		} );
		await expect( block ).toBeVisible();
		await expect(
			block.getByText( /Portal ID.*Form ID/i )
		).toBeVisible();
	} );

	test( 'should show labeled success-message zone', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.setPreferences( 'core/edit-post', {
			welcomeGuide: false,
		} );

		await editor.insertBlock( { name: 'hubspot/form' } );

		const block = editorCanvas( page ).getByRole( 'document', {
			name: 'Block: Hubspot Form',
		} );
		await expect( block ).toBeVisible();
		await expect(
			block.getByText( /Success message/i )
		).toBeVisible();
	} );
} );
