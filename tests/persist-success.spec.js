/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	dispatchHubSpotSuccess,
	presetFormSubmittedFlag,
} = require( './helpers' );

const PORTAL_ID = '148262752';
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';

test.describe( 'HubSpot Form — persist success', () => {
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

	test( 'should include the first-submission group in the <template>', async ( {
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

		const hasFirstSubmissionGroup = await page.evaluate( ( id ) => {
			const tmpl = document.getElementById( `${ id }-inline-message` );
			if ( ! tmpl ) {
				return false;
			}
			return (
				tmpl.content.querySelector(
					'.is-hubspot-form-first-submission'
				) !== null
			);
		}, instanceId );

		expect( hasFirstSubmissionGroup ).toBe( true );
	} );

	test( 'should show full inline message including first-submission group on fresh success', async ( {
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

		await dispatchHubSpotSuccess( page, instanceId, FORM_ID );

		// The container should now show the full inline message.
		await expect(
			page.locator( `#${ instanceId } p` ).filter( {
				hasText: 'Thank you!',
			} )
		).toBeAttached();

		// The first-submission group should still be present on first success.
		await expect(
			page.locator( `#${ instanceId } .is-hubspot-form-first-submission` )
		).toBeAttached();

		// The localStorage entry should be an array containing the current pathname.
		const { stored, pathname } = await page.evaluate( ( formId ) => {
			try {
				return {
					// eslint-disable-next-line no-undef
					stored: JSON.parse(
						// eslint-disable-next-line no-undef
						localStorage.getItem(
							`hs-form-submitted:${ formId }`
						) || '[]'
					),
					// eslint-disable-next-line no-undef
					pathname: window.location.pathname,
				};
			} catch ( e ) {
				return { stored: [], pathname: '' };
			}
		}, FORM_ID );
		expect( Array.isArray( stored ) ).toBe( true );
		expect( stored ).toContain( pathname );
	} );

	test( 'should pre-swap the container on repeat visit, stripping the first-submission group', async ( {
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

		// Seed localStorage before navigation to simulate a returning visitor.
		await presetFormSubmittedFlag( page, FORM_ID );
		await page.goto( `/?p=${ postId }` );

		// The container element keeps its id even after the pre-swap strips
		// HubSpot's data attributes, so look it up by id via the template.
		const instanceId = await page.evaluate( () => {
			const tmpl = document.querySelector(
				'template[id$="-inline-message"]'
			);
			return tmpl ? tmpl.id.replace( '-inline-message', '' ) : null;
		} );

		// The success paragraph should be present immediately after pre-swap.
		const successParagraph = page.locator( `#${ instanceId } p` ).filter( {
			hasText: 'Thank you!',
		} );
		await expect( successParagraph ).toBeAttached();

		// Wait 5 seconds to confirm the HubSpot SDK has not overwritten the
		// pre-swapped content by re-rendering the form into the container.
		await page.waitForTimeout( 5000 );
		await expect( successParagraph ).toBeAttached();

		// The first-submission group should have been stripped.
		await expect(
			page.locator( `#${ instanceId } .is-hubspot-form-first-submission` )
		).not.toBeAttached();

		// The loading spinner should not remain.
		await expect(
			page.locator( `#${ instanceId } .wp-block-hubspot-form__loading` )
		).not.toBeAttached();
	} );
} );
