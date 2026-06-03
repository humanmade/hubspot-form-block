/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const { dispatchHubSpotSuccess, isAbsentFromSource } = require( './helpers' );

const PORTAL_ID = '148262752';
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';

test.describe( 'HubSpot Form — gated success message', () => {
	test( 'does not emit gated content into the page source, but injects it after submission', async ( {
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
			innerBlocks: [
				{
					name: 'core/paragraph',
					attributes: { content: 'Secret gated content!' },
				},
			],
		} );

		const postId = await editor.publishPost();
		await page.goto( `/?p=${ postId }` );

		const container = page.locator( '.hs-form-html' );
		await expect( container ).toBeAttached();
		const instanceId = await container.getAttribute( 'id' );

		// The gated content must NOT be present in the page source, and the old
		// <template> mechanism must be gone.
		expect(
			await isAbsentFromSource( page, 'Secret gated content!' )
		).toBe( true );
		await expect(
			page.locator( `template#${ instanceId }-inline-message` )
		).not.toBeAttached();

		// The config should flag this instance as gated and carry the endpoint.
		const config = await page.evaluate(
			( id ) => window.hsForms?.[ id ],
			instanceId
		);
		expect( config.gated ).toBe( true );
		expect( config.restUrl ).toContain( 'hubspot-form-block/v1/unlock' );

		// After a successful submission the content is fetched and injected.
		// (No token is configured in Playground, so the endpoint is best-effort.)
		await dispatchHubSpotSuccess( page, instanceId, FORM_ID );

		await expect(
			page
				.locator( `#${ instanceId } p` )
				.filter( { hasText: 'Secret gated content!' } )
		).toBeAttached();
	} );

	test( 'preserves embed iframes in the fetched content', async ( {
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
			innerBlocks: [
				{
					name: 'core/embed',
					attributes: {
						url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						providerNameSlug: 'youtube',
						type: 'video',
					},
				},
			],
		} );

		const postId = await editor.publishPost();
		await page.goto( `/?p=${ postId }` );

		const container = page.locator( '.hs-form-html' );
		await expect( container ).toBeAttached();
		const instanceId = await container.getAttribute( 'id' );

		await dispatchHubSpotSuccess( page, instanceId, FORM_ID );

		// The fetched, injected content should contain the embed iframe.
		await expect(
			page.locator( `#${ instanceId } iframe` )
		).toBeAttached();
	} );

	test( 'does not flag the instance as gated when no inner blocks are present', async ( {
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
		const instanceId = await container.getAttribute( 'id' );

		const config = await page.evaluate(
			( id ) => window.hsForms?.[ id ],
			instanceId
		);
		expect( config.gated ).toBeUndefined();
		await expect(
			page.locator( `template#${ instanceId }-inline-message` )
		).not.toBeAttached();
	} );
} );
