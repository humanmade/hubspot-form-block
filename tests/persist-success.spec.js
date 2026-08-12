/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	dispatchHubSpotSuccess,
	mockUnlockEndpoint,
	presetFormSubmittedFlag,
} = require( './helpers' );

const PORTAL_ID = '148262752';
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';

test.describe( 'HubSpot Form — persist success (gated content)', () => {
	test( 'should include persistSuccess and storageKey in injected config when enabled', async ( {
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
				persistSuccess: true,
			},
			innerBlocks: [
				{
					name: 'core/paragraph',
					attributes: { content: 'Thank you!' },
				},
			],
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

		expect( config.persistSuccess ).toBe( true );
		expect( config.storageKey ).toBe( `hs-form-submitted:${ FORM_ID }` );
		expect( config.gated ).toBe( true );
		expect( config.restUrl ).toContain( 'hubspot-form-block/v1/unlock' );
	} );

	test( 'should not include persistSuccess or storageKey when not enabled', async ( {
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
					attributes: { content: 'Thank you!' },
				},
			],
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

		expect( config.persistSuccess ).toBeUndefined();
		expect( config.storageKey ).toBeUndefined();
	} );

	test( 'should not include persistSuccess when redirectUrl is set', async ( {
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
				persistSuccess: true,
				redirectUrl: 'https://example.com/thanks',
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

		expect( config.persistSuccess ).toBeUndefined();
		expect( config.storageKey ).toBeUndefined();
	} );

	test( 'shows full message including first-submission group on fresh success and persists a token', async ( {
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
				persistSuccess: true,
			},
			innerBlocks: [
				{
					name: 'core/paragraph',
					attributes: { content: 'Thank you!' },
				},
				{
					name: 'core/group',
					attributes: {
						className: 'is-hubspot-form-first-submission',
					},
					innerBlocks: [
						{
							name: 'core/heading',
							attributes: {
								content: 'One-time only message',
								level: 3,
							},
						},
					],
				},
			],
		} );

		const postId = await editor.publishPost();
		await page.goto( `/?p=${ postId }` );

		const container = page.locator( '.hs-form-html' );
		await expect( container ).toBeAttached();
		const instanceId = await container.getAttribute( 'id' );

		// Best-effort (no token) endpoint in Playground returns the content.
		await dispatchHubSpotSuccess( page, instanceId, FORM_ID );

		await expect(
			page
				.locator( `#${ instanceId } p` )
				.filter( { hasText: 'Thank you!' } )
		).toBeAttached();

		// On a fresh submission, the first-submission group is preserved.
		await expect(
			page.locator( `#${ instanceId } .is-hubspot-form-first-submission` )
		).toBeAttached();

		// localStorage records this path with an unlock token (new shape).
		const entry = await page.evaluate( ( formId ) => {
			try {
				// eslint-disable-next-line no-undef
				const entries = JSON.parse(
					// eslint-disable-next-line no-undef
					localStorage.getItem( `hs-form-submitted:${ formId }` ) ||
						'[]'
				);
				return entries.find(
					( item ) => item.path === window.location.pathname
				);
			} catch ( e ) {
				return null;
			}
		}, FORM_ID );

		expect( entry ).toBeTruthy();
		expect( typeof entry.token ).toBe( 'string' );
		expect( entry.token.length ).toBeGreaterThan( 0 );
	} );

	test( 'on repeat visit, re-fetches via stored token and strips the first-submission group', async ( {
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
				persistSuccess: true,
			},
			innerBlocks: [
				{
					name: 'core/paragraph',
					attributes: { content: 'Thank you!' },
				},
			],
		} );

		const postId = await editor.publishPost();

		// Deterministic gated content from the endpoint, including a
		// first-submission group that should be stripped on repeat visits.
		await mockUnlockEndpoint( page, {
			html:
				'<div class="wp-block-hubspot-form__inline-message">' +
				'<p>Thank you!</p>' +
				'<div class="is-hubspot-form-first-submission"><h3>One-time only message</h3></div>' +
				'</div>',
		} );

		// Seed the persisted unlock token to simulate a returning visitor.
		await presetFormSubmittedFlag( page, FORM_ID );
		await page.goto( `/?p=${ postId }` );

		const instanceId = await page.evaluate(
			() => Object.keys( window.hsForms || {} )[ 0 ]
		);

		// The success paragraph is injected from the (token-verified) fetch.
		const successParagraph = page
			.locator( `#${ instanceId } p` )
			.filter( { hasText: 'Thank you!' } );
		await expect( successParagraph ).toBeAttached();

		// The first-submission group is stripped on repeat visits.
		await expect(
			page.locator( `#${ instanceId } .is-hubspot-form-first-submission` )
		).not.toBeAttached();

		// The loading spinner should be gone after injection.
		await expect(
			page.locator( `#${ instanceId } .wp-block-hubspot-form__loading` )
		).not.toBeAttached();

		// Confirm HubSpot does not later overwrite the injected content.
		await page.waitForTimeout( 3000 );
		await expect( successParagraph ).toBeAttached();
	} );
} );
