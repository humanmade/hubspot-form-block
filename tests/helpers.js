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
 * Stands in for HubSpot's legacy embed script.
 *
 * Blocks the real script, then installs an hbspt global and an hsFormsOnReady
 * queue that runs callbacks straight away, which is how the real queue behaves
 * once the script has loaded. Calls to forms.create are recorded on
 * window.__hbsptCalls, and each one renders a minimal form into its target and
 * fires onFormReady, so view.js sees the same shape it would in a browser.
 *
 * @param {import('@playwright/test').Page} page
 */
async function stubLegacyHubSpot( page ) {
	await page.route( '**/*.hsforms.net/**', ( route ) => route.abort() );

	await page.addInitScript( () => {
		window.__hbsptCalls = [];

		const queue = [];
		queue.push = ( callback ) => {
			callback();
			return 0;
		};
		window.hsFormsOnReady = queue;

		window.hbspt = {
			forms: {
				create: ( options ) => {
					window.__hbsptCalls.push( options );

					const target = document.querySelector( options.target );
					if ( ! target ) {
						return;
					}

					const form = document.createElement( 'form' );
					const submit = document.createElement( 'input' );
					submit.type = 'submit';
					submit.value = 'Submit';
					form.appendChild( submit );
					target.replaceChildren( form );

					options.onFormReady?.( {} );
				},
			},
		};
	} );
}

/**
 * Fires the onFormSubmitted callback of the most recent legacy form.
 *
 * @param {import('@playwright/test').Page} page
 */
async function dispatchLegacySuccess( page ) {
	await page.evaluate( () => {
		window.dataLayer = window.dataLayer || [];
		const options = window.__hbsptCalls[ window.__hbsptCalls.length - 1 ];
		options.onFormSubmitted?.( {}, {} );
	} );
}

module.exports = {
	editorCanvas,
	dispatchHubSpotSuccess,
	presetFormSubmittedFlag,
	stubLegacyHubSpot,
	dispatchLegacySuccess,
};
