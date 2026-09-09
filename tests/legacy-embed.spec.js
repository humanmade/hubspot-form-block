/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { stubLegacyHubSpot, dispatchLegacySuccess } = require( './helpers' );

const PORTAL_ID = '148262752';
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';

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
			region: 'na1',
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

test.describe( 'HubSpot Form — legacy embed', () => {
	test( 'should render a container and scripts the current loader ignores', async ( {
		admin,
		editor,
		page,
	} ) => {
		await stubLegacyHubSpot( page );
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
		expect( config.region ).toBe( 'na1' );
	} );

	test( 'should build the form and label its submit input', async ( {
		admin,
		editor,
		page,
	} ) => {
		await stubLegacyHubSpot( page );
		const instanceId = await publishLegacyForm(
			{ admin, editor, page },
			{ submitText: 'Sign me up' }
		);

		const options = await page.evaluate( () => {
			const call = window.__hbsptCalls[ 0 ];
			return {
				portalId: call.portalId,
				formId: call.formId,
				region: call.region,
				target: call.target,
			};
		} );

		expect( options ).toEqual( {
			portalId: PORTAL_ID,
			formId: FORM_ID,
			region: 'na1',
			target: `#${ instanceId }`,
		} );

		// The legacy embed renders <input type="submit">, which takes its
		// label from value. Setting text content would leave it unchanged.
		const submit = page.locator( `#${ instanceId } [type="submit"]` );
		await expect( submit ).toHaveValue( 'Sign me up' );
		await expect( submit ).toHaveClass( /hs-button/ );
	} );

	test( 'should show the success message and report the submission', async ( {
		admin,
		editor,
		page,
	} ) => {
		await stubLegacyHubSpot( page );
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

		await dispatchLegacySuccess( page );

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
