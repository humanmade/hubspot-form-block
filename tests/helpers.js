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
	await page.evaluate(
		( [ id, fId ] ) => {
			window.HubSpotFormsV4 = {
				getFormFromEvent: () => ( {
					getInstanceId: () => id,
					getFormId: () => fId,
					getConversionId: () => 'test-conversion-id',
				} ),
			};
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
		localStorage.setItem( `hs-form-submitted:${ fId }`, '1' );
	}, formId );
}

module.exports = {
	editorCanvas,
	dispatchHubSpotSuccess,
	presetFormSubmittedFlag,
};
