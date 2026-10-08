/**
 * Returns a locator scoped to the block editor canvas iframe, which
 * WordPress uses to isolate block content from the surrounding admin UI.
 *
 * @param {import('@playwright/test').Page} page
 * @return {import('@playwright/test').FrameLocator} Editor canvas frame.
 */
function editorCanvas( page ) {
	return page.locator( 'iframe[name="editor-canvas"]' ).contentFrame();
}

/**
 * Dispatches a mocked hs-form-event:on-submission:success event for a given
 * HubSpot form instance. Stubs HubSpotFormsV4.getFormFromEvent to return a
 * minimal form object so view.js event handlers fire correctly.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          instanceId The form container id.
 * @param {string}                          formId     The HubSpot form id.
 */
async function dispatchHubSpotSuccess( page, instanceId, formId ) {
	// HubSpot's embed script replaces the container's contents once it has
	// resolved the form, so a success dispatched before that lands gets wiped
	// out again mid test. The script sets data-loaded when it is finished.
	await page.waitForSelector( `#${ instanceId }[data-loaded]` );

	await page.evaluate(
		( [ id, fId ] ) => {
			// Once HubSpot's script has loaded it owns this global, and it
			// defines it as read only, so a plain assignment silently does
			// nothing and view.js ends up calling the real implementation
			// with a synthetic event. The property is configurable, so
			// defineProperty is the way to stand in for it.
			Object.defineProperty( window, 'HubSpotFormsV4', {
				configurable: true,
				value: {
					getFormFromEvent: () => ( {
						getInstanceId: () => id,
						getFormId: () => fId,
						getConversionId: () => 'test-conversion-id',
					} ),
				},
			} );
			window.dataLayer = window.dataLayer || [];
			window.dispatchEvent(
				new Event( 'hs-form-event:on-submission:success' )
			);
		},
		[ instanceId, formId ]
	);
}

/**
 * Seeds localStorage with the form-submitted flag before the page navigates,
 * so the pre-swap inline script in render.php fires on page load.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          formId The HubSpot form id.
 */
async function presetFormSubmittedFlag( page, formId ) {
	await page.addInitScript( ( fId ) => {
		// eslint-disable-next-line no-undef
		localStorage.setItem(
			`hs-form-submitted:${ fId }`,
			JSON.stringify( [ window.location.pathname ] )
		);
	}, formId );
}

/**
 * Answers a legacy form submission in place of HubSpot.
 *
 * The legacy form posts into a hidden iframe, and HubSpot's reply is a page
 * that tells the form it was accepted by posting a message from that iframe.
 * Serving that page here lets the real embed run its own success path without
 * a submission reaching the test account.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          formId The HubSpot form id.
 */
async function mockLegacySubmission( page, formId ) {
	const message = JSON.stringify( { accepted: true, formGuid: formId } );

	await page.route(
		'**/submissions/v3/public/submit/formsnext/multipart/**',
		( route ) =>
			route.fulfill( {
				contentType: 'text/html',
				body: `<script>parent.postMessage( ${ message }, '*' );</script>`,
			} )
	);
}

module.exports = {
	editorCanvas,
	dispatchHubSpotSuccess,
	presetFormSubmittedFlag,
	mockLegacySubmission,
};
