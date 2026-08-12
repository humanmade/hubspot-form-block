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
 * @param {string}                          [email]    Submitted email value.
 */
async function dispatchHubSpotSuccess( page, instanceId, formId, email = '' ) {
	await page.evaluate(
		( [ id, fId, mail ] ) => {
			window.HubSpotFormsV4 = {
				getFormFromEvent: () => ( {
					getInstanceId: () => id,
					getFormId: () => fId,
					getConversionId: () => 'test-conversion-id',
					getFormFieldValues: async () => ( { email: mail } ),
				} ),
			};
			window.dataLayer = window.dataLayer || [];
			window.dispatchEvent(
				new Event( 'hs-form-event:on-submission:success' )
			);
		},
		[ instanceId, formId, email ]
	);
}

/**
 * Intercepts the unlock REST endpoint and returns canned responses.
 *
 * By default returns a single 200 with `html`. Pass `pendingBefore` to return
 * that many 202 "pending" responses before succeeding (to exercise polling).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object}                          [options]
 * @param {string}                          [options.html]          HTML to return.
 * @param {number}                          [options.pendingBefore] 202 responses first.
 * @param {?string}                         [options.unlockToken]   Token to return.
 */
async function mockUnlockEndpoint( page, options = {} ) {
	const {
		html = '<div class="wp-block-hubspot-form__inline-message"><p>Thank you!</p></div>',
		pendingBefore = 0,
		unlockToken = 'test-unlock-token',
	} = options;

	let calls = 0;
	await page.route( '**/hubspot-form-block/v1/unlock', async ( route ) => {
		calls++;
		if ( calls <= pendingBefore ) {
			await route.fulfill( {
				status: 202,
				contentType: 'application/json',
				body: JSON.stringify( { status: 'pending' } ),
			} );
			return;
		}
		await route.fulfill( {
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify( { html, unlockToken } ),
		} );
	} );
}

/**
 * Asserts a string is absent from the raw page HTML (i.e. not in page source).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          needle Text that must not appear.
 * @return {Promise<boolean>} True when absent.
 */
async function isAbsentFromSource( page, needle ) {
	const html = await page.content();
	return ! html.includes( needle );
}

/**
 * Seeds localStorage with a persisted unlock entry before the page navigates,
 * so the returning-visitor flow in view.js fires on page load.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          formId  The HubSpot form id.
 * @param {?string}                         [token] Unlock token to seed.
 */
async function presetFormSubmittedFlag(
	page,
	formId,
	token = 'test-unlock-token'
) {
	await page.addInitScript(
		( [ fId, tok ] ) => {
			// eslint-disable-next-line no-undef
			localStorage.setItem(
				`hs-form-submitted:${ fId }`,
				JSON.stringify( [
					{ path: window.location.pathname, token: tok },
				] )
			);
		},
		[ formId, token ]
	);
}

module.exports = {
	editorCanvas,
	dispatchHubSpotSuccess,
	mockUnlockEndpoint,
	isAbsentFromSource,
	presetFormSubmittedFlag,
};
