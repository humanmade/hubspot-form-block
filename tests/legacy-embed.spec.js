/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { mockLegacySubmission } = require( './helpers' );

// A form built in HubSpot's older forms editor, which the v4 embed cannot load.
const PORTAL_ID = '148262752';
const FORM_ID = '52c02bf0-8aab-46b4-a8b0-0ee0b464b2d5';
const REGION = 'eu1';

/**
 * Publishes a post holding one legacy embed block and opens it.
 *
 * Each test publishes a post, which is the slow part of the run, so they cover
 * a whole stage of the embed rather than one assertion each.
 *
 * @param {Object} context        Playwright fixtures.
 * @param {Object} context.admin
 * @param {Object} context.editor
 * @param {Object} context.page
 * @param {Object} attributes     Extra block attributes.
 * @param {Array}  innerBlocks    Success message blocks.
 * @return {Promise<string>} The rendered container's id.
 */
async function publishLegacyForm(
	{ admin, editor, page },
	attributes = {},
	innerBlocks = []
) {
	await admin.createNewPost();
	await editor.setPreferences( 'core/edit-post', { welcomeGuide: false } );

	await editor.insertBlock( {
		name: 'hubspot/form',
		attributes: {
			portalId: PORTAL_ID,
			region: REGION,
			formId: FORM_ID,
			legacyEmbed: true,
			...attributes,
		},
		innerBlocks,
	} );

	const postId = await editor.publishPost();
	await page.goto( `/?p=${ postId }` );

	const container = page.locator( '.hs-form-legacy' );
	await expect( container ).toBeAttached();

	return container.getAttribute( 'id' );
}

/**
 * Returns the form HubSpot's legacy embed rendered, which sits in an iframe.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          instanceId The form container id.
 * @return {import('@playwright/test').Locator} The rendered form.
 */
function legacyForm( page, instanceId ) {
	return page
		.locator( `#${ instanceId } iframe.hs-form-iframe` )
		.contentFrame()
		.locator( 'form' );
}

test.describe( 'HubSpot Form — legacy embed', () => {
	test( 'should render a container and scripts the current loader ignores', async ( {
		admin,
		editor,
		page,
	} ) => {
		const instanceId = await publishLegacyForm( { admin, editor, page } );

		// The current loader only picks up .hs-form-html, so a legacy form
		// must not carry that class or it would be requested twice.
		await expect( page.locator( '.hs-form-html' ) ).not.toBeAttached();

		const sources = await page.evaluate( () =>
			Array.from( document.querySelectorAll( 'script[src]' ) )
				.map( ( script ) => script.src )
				.filter( ( src ) => src.includes( 'hsforms.net' ) )
		);

		expect(
			sources.some( ( src ) => src.includes( '/embed/v2.js' ) )
		).toBe( true );
		expect(
			sources.some( ( src ) => src.includes( '/embed/developer/' ) )
		).toBe( false );

		// The legacy script builds the form from JavaScript rather than from
		// the container's data attributes, so the config carries the values.
		const config = await page.evaluate(
			( id ) => window.hsForms?.[ id ],
			instanceId
		);

		expect( config.legacy ).toBe( true );
		expect( config.portalId ).toBe( PORTAL_ID );
		expect( config.formId ).toBe( FORM_ID );
		expect( config.region ).toBe( REGION );
	} );

	test( 'should build the form and label its submit input', async ( {
		admin,
		editor,
		page,
	} ) => {
		const instanceId = await publishLegacyForm(
			{ admin, editor, page },
			{ submitText: 'Sign me up' }
		);

		const form = legacyForm( page, instanceId );
		await expect( form ).toHaveAttribute( 'data-form-id', FORM_ID );
		await expect( form ).toHaveAttribute( 'data-portal-id', PORTAL_ID );

		// The legacy embed renders <input type="submit">, which takes its
		// label from value. Setting text content would leave it unchanged.
		const submit = form.locator( '[type="submit"]' );
		await expect( submit ).toHaveValue( 'Sign me up' );
		await expect( submit ).toHaveClass( /wp-element-button/ );
	} );

	test( 'should show the success message and report the submission', async ( {
		admin,
		editor,
		page,
	} ) => {
		await mockLegacySubmission( page, FORM_ID );
		const instanceId = await publishLegacyForm(
			{ admin, editor, page },
			{ gtmEventName: 'newsletter_signup' },
			[
				{
					name: 'core/paragraph',
					attributes: { content: 'Thank you for signing up!' },
				},
			]
		);

		const form = legacyForm( page, instanceId );
		await form.locator( 'input[name="email"]' ).fill( 'test@example.com' );
		await form.locator( '[type="submit"]' ).click();

		await expect( page.locator( `#${ instanceId }` ) ).toContainText(
			'Thank you for signing up!'
		);

		const pushed = await page.evaluate( () =>
			window.dataLayer.find(
				( entry ) => entry.event === 'newsletter_signup'
			)
		);

		expect( pushed.formId ).toBe( FORM_ID );
		expect( pushed.instanceId ).toBe( instanceId );
		expect( pushed.source ).toBe( 'hubspot_form_wordpress_plugin' );
	} );
} );
