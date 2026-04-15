/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const PORTAL_ID = '148262752';
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';

test.describe( 'HubSpot Form — inline success message', () => {
	test( 'should emit a <template> element when inner blocks are present', async ( {
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
					attributes: { content: 'Thank you for signing up!' },
				},
			],
		} );

		const postId = await editor.publishPost();
		await page.goto( `/?p=${ postId }` );

		const container = page.locator( '.hs-form-html' );
		await expect( container ).toBeAttached();

		const instanceId = await container.getAttribute( 'id' );

		// The <template> element is emitted server-side by render.php.
		const template = page.locator(
			`template#${ instanceId }-inline-message`
		);
		await expect( template ).toBeAttached();
	} );

	test( 'should include embed iframes inside the <template> without stripping', async ( {
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

		// The template's content fragment should contain an iframe (YouTube embed).
		// Previously DOMPurify stripped iframes; the <template> approach preserves them.
		const hasIframe = await page.evaluate( ( id ) => {
			const tmpl = document.getElementById( `${ id }-inline-message` );
			if ( ! tmpl ) return false;
			return tmpl.content.querySelector( 'iframe' ) !== null;
		}, instanceId );

		expect( hasIframe ).toBe( true );
	} );

	test( 'should not emit a <template> when no inner blocks are present', async ( {
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
		const template = page.locator(
			`template#${ instanceId }-inline-message`
		);
		await expect( template ).not.toBeAttached();
	} );
} );
