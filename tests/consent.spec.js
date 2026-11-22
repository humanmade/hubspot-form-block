/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const PORTAL_ID = 148262752;
const FORM_ID = 'ec0707d2-b7f5-47c5-bfef-76eb7e8f837e';

// Granting analytics only, as HubSpot is told about it.
const ANALYTICS_ONLY = {
	analytics: true,
	advertisement: false,
	functionality: false,
};

// Restore values: 0 is the "unset" Portal ID, as in global-settings.spec.js.
const DEFAULT_SETTINGS = {
	hubspot_embed_portal_id: 0,
	hubspot_embed_tracking: 'auto',
};

let postUrl;

/**
 * Writes the plugin's global settings via the REST API.
 *
 * @param {Object} requestUtils The e2e request utils fixture.
 * @param {Object} data         Settings to write.
 */
async function setSettings( requestUtils, data ) {
	await requestUtils.rest( {
		path: '/wp/v2/settings',
		method: 'POST',
		data,
	} );
}

/**
 * Sets the tracking mode the next page load will use.
 *
 * @param {Object} requestUtils The e2e request utils fixture.
 * @param {string} mode         One of auto, consent, always or never.
 */
function setTracking( requestUtils, mode ) {
	return setSettings( requestUtils, { hubspot_embed_tracking: mode } );
}

/**
 * Answers requests for HubSpot's tracking script with a stub, so the real
 * tracker is never reached.
 *
 * @param {import('@playwright/test').Page} page
 * @return {Promise<string[]>} A list that collects the URL of each request.
 */
async function stubTracker( page ) {
	const requests = [];

	await page.route( /hs-scripts\.com/, ( route ) => {
		requests.push( route.request().url() );
		return route.fulfill( {
			contentType: 'application/javascript',
			body: 'window.__hsTrackerLoads = ( window.__hsTrackerLoads || 0 ) + 1;',
		} );
	} );

	return requests;
}

/**
 * Scrolls the page and waits briefly, so a request that is going to happen
 * has had the chance to.
 *
 * @param {import('@playwright/test').Page} page
 */
async function settle( page ) {
	await page.evaluate( () =>
		window.scrollTo( 0, document.body.scrollHeight )
	);
	await page.waitForTimeout( 500 );
}

/**
 * Stubs the WP Consent API in the browser.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object}                          options
 * @param {boolean}                         options.waitForHook Wait for the consent type to be defined.
 * @param {boolean}                         options.noType      Leave the consent type unset, so everything is reported as granted.
 */
function stubWpConsentApi(
	page,
	{ waitForHook = false, noType = false } = {}
) {
	return page.addInitScript(
		( { hook, untyped } ) => {
			window.__consent = {};
			if ( hook ) {
				window.waitfor_consent_hook = true;
				window.wp_has_consent = () => true;
			} else if ( untyped ) {
				window.wp_has_consent = () => true;
			} else {
				window.wp_consent_type = 'optin';
				window.wp_has_consent = ( category ) =>
					window.__consent[ category ] === 'allow';
			}
		},
		{ hook: waitForHook, untyped: noType }
	);
}

// Google Consent Mode default commands used by the order tests.
const GCM_DEFAULTS = {
	// A global denial.
	b: {
		analytics_storage: 'denied',
		ad_storage: 'denied',
		functionality_storage: 'denied',
	},
	// A region-scoped denial.
	c: {
		analytics_storage: 'denied',
		ad_storage: 'denied',
		functionality_storage: 'denied',
		region: [ 'DE' ],
	},
	// A global grant.
	d: {
		analytics_storage: 'granted',
		ad_storage: 'granted',
		functionality_storage: 'granted',
	},
};

const GCM_ORDERS = [
	[ 'b', 'c', 'd' ],
	[ 'b', 'd', 'c' ],
	[ 'c', 'b', 'd' ],
	[ 'c', 'd', 'b' ],
	[ 'd', 'b', 'c' ],
	[ 'd', 'c', 'b' ],
];

/**
 * Defines gtag() and pushes Google Consent Mode defaults before the page's
 * scripts run.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]}                        order Keys of GCM_DEFAULTS, in the order to push them.
 */
function preloadGcmDefaults( page, order = [] ) {
	return page.addInitScript(
		( commands ) => {
			window.dataLayer = window.dataLayer || [];
			window.gtag = function () {
				window.dataLayer.push( arguments );
			};
			commands.forEach( ( command ) =>
				window.gtag( 'consent', 'default', command )
			);
		},
		order.map( ( key ) => GCM_DEFAULTS[ key ] )
	);
}

/**
 * Returns the last value HubSpot was told about with setHubSpotConsent.
 *
 * @param {import('@playwright/test').Page} page
 */
async function lastHubSpotConsent( page ) {
	const hsp = await page.evaluate( () => window._hsp );
	const calls = hsp.filter( ( entry ) => entry[ 0 ] === 'setHubSpotConsent' );
	return calls[ calls.length - 1 ][ 1 ];
}

test.describe( 'HubSpot Form Block consent and tracking', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await setSettings( requestUtils, {
			...DEFAULT_SETTINGS,
			hubspot_embed_portal_id: PORTAL_ID,
		} );

		const post = await requestUtils.createPost( {
			title: 'HubSpot consent test',
			status: 'publish',
			content: `<!-- wp:hubspot/form ${ JSON.stringify( {
				portalId: String( PORTAL_ID ),
				region: 'na1',
				formId: FORM_ID,
			} ) } /-->`,
		} );
		postUrl = post.link;
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await setSettings( requestUtils, DEFAULT_SETTINGS );
	} );

	test( 'always loads the tracker on page load', async ( {
		page,
		requestUtils,
	} ) => {
		await setTracking( requestUtils, 'always' );
		const requests = await stubTracker( page );

		await page.goto( postUrl );

		await expect.poll( () => requests.length ).toBe( 1 );
		expect(
			await page.evaluate( () => window.hubspotFormBlockTracking )
		).toBeUndefined();
	} );

	test( 'auto loads the tracker on page load without the WP Consent API', async ( {
		page,
		requestUtils,
	} ) => {
		await setTracking( requestUtils, 'auto' );
		const requests = await stubTracker( page );

		await page.goto( postUrl );

		await expect.poll( () => requests.length ).toBe( 1 );
	} );

	test( 'never does not load the tracker but still renders the form', async ( {
		page,
		requestUtils,
	} ) => {
		await setTracking( requestUtils, 'never' );
		const requests = await stubTracker( page );

		await page.goto( postUrl );
		await expect( page.locator( '[data-embed-src]' ) ).toBeAttached();
		await settle( page );

		expect( requests ).toHaveLength( 0 );
	} );

	test.describe( 'in consent mode', () => {
		test.beforeEach( async ( { requestUtils } ) => {
			await setTracking( requestUtils, 'consent' );
		} );

		test( 'loads the tracker once the JS API grants analytics', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
			expect(
				await page.evaluate( () => window.disableHubSpotCookieBanner )
			).toBe( true );
			expect( await page.evaluate( () => window._hsp ) ).toContainEqual( [
				'setHubSpotConsent',
				ANALYTICS_ONLY,
			] );
		} );

		test( 'loads the tracker for a queue pushed before page load', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [ { functionality: true } ];
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
			// Analytics was not granted, so HubSpot is told not to track.
			expect( await page.evaluate( () => window._hsq ) ).toContainEqual( [
				'doNotTrack',
			] );
		} );

		test( 'follows Google Consent Mode updates', async ( { page } ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'default', {
					analytics_storage: 'denied',
					ad_storage: 'denied',
				} );
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'ignores a region-scoped Google Consent Mode grant', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'default', {
					analytics_storage: 'granted',
					region: [ 'US' ],
				} );
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'does not load the tracker for a grant that is denied later during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'default', {
					analytics_storage: 'granted',
				} );
				window.gtag( 'consent', 'update', {
					analytics_storage: 'denied',
				} );
			} );

			await page.goto( postUrl );
			await settle( page );

			expect( requests ).toHaveLength( 0 );
		} );

		test( 'does not load the tracker for a queue that withdraws analytics during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [
					{ analytics: true },
					{ analytics: false },
				];
			} );

			await page.goto( postUrl );
			await settle( page );

			expect( requests ).toHaveLength( 0 );
		} );

		test( 'lets an explicit JS API choice win over a Google Consent Mode default', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'default', {
					analytics_storage: 'denied',
				} );
				window.hubspotFormBlockConsent = [ { analytics: true } ];
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect(
				await page.evaluate( () => window._hsp )
			).not.toContainEqual( [ 'revokeCookieConsent' ] );
		} );

		test( 'follows the WP Consent API', async ( { page } ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				window.__consent.statistics = 'allow';
				document.dispatchEvent(
					new CustomEvent( 'wp_listen_for_consent_change', {
						detail: { statistics: 'allow' },
					} )
				);
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await page.evaluate( () => window._hsp ) ).toContainEqual( [
				'setHubSpotConsent',
				ANALYTICS_ONLY,
			] );
		} );

		test( 'only reads the categories named by a WP Consent API change', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page );
			await page.addInitScript( () => {
				window.__consent.statistics = 'allow';
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
			} );

			await page.goto( postUrl );
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.gtag( 'consent', 'update', {
					analytics_storage: 'denied',
				} )
			);
			await page.evaluate( () => {
				window.__consent.marketing = 'allow';
				document.dispatchEvent(
					new CustomEvent( 'wp_listen_for_consent_change', {
						detail: { marketing: 'allow' },
					} )
				);
			} );

			await expect
				.poll( async () => {
					const hsp = await page.evaluate( () => window._hsp );
					const calls = hsp.filter(
						( entry ) => entry[ 0 ] === 'setHubSpotConsent'
					);
					return calls[ calls.length - 1 ][ 1 ];
				} )
				.toMatchObject( { analytics: false, advertisement: true } );
		} );

		test( 'waits for the WP Consent API consent type to be defined', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { waitForHook: true } );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				document.dispatchEvent( new Event( 'wp_consent_type_defined' ) )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'lets a Google Consent Mode default deny what an untyped WP Consent API reports as granted', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
			} );

			await page.goto( postUrl );
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.gtag( 'consent', 'default', {
					analytics_storage: 'denied',
				} )
			);

			await expect
				.poll( () => page.evaluate( () => window._hsp ) )
				.toContainEqual( [ 'revokeCookieConsent' ] );
			const hsp = await page.evaluate( () => window._hsp );
			const calls = hsp.filter(
				( entry ) => entry[ 0 ] === 'setHubSpotConsent'
			);
			expect( calls[ calls.length - 1 ][ 1 ].analytics ).toBe( false );
		} );

		test( 'ignores a WP Consent API change event that arrives before the consent type is defined', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { waitForHook: true } );

			await page.goto( postUrl );
			await page.evaluate( () =>
				document.dispatchEvent(
					new CustomEvent( 'wp_listen_for_consent_change', {
						detail: { statistics: 'deny' },
					} )
				)
			);
			await settle( page );

			expect( requests ).toHaveLength( 0 );
		} );

		test( 'gives a region-scoped Google Consent Mode denial precedence over a global default', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'default', {
					analytics_storage: 'denied',
					region: [ 'DE' ],
				} );
				window.gtag( 'consent', 'default', {
					analytics_storage: 'granted',
				} );
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		for ( const withWp of [ true, false ] ) {
			test( `loads no tracker for any order of Google Consent Mode defaults ${
				withWp ? 'over' : 'without'
			} an untyped WP Consent API`, async ( { context } ) => {
				for ( const order of GCM_ORDERS ) {
					const page = await context.newPage();
					const requests = await stubTracker( page );
					if ( withWp ) {
						await stubWpConsentApi( page, { noType: true } );
					}
					await preloadGcmDefaults( page, order );

					await page.goto( postUrl );
					await settle( page );

					expect( requests, order.join() ).toHaveLength( 0 );
					await page.close();
				}
			} );
		}

		test( 'ends with everything denied for any order of Google Consent Mode defaults pushed after an untyped WP Consent API grant', async ( {
			context,
		} ) => {
			for ( const order of GCM_ORDERS ) {
				const page = await context.newPage();
				const requests = await stubTracker( page );
				await stubWpConsentApi( page, { noType: true } );
				await preloadGcmDefaults( page );

				await page.goto( postUrl );
				await expect.poll( () => requests.length ).toBe( 1 );

				await page.evaluate(
					( commands ) => {
						commands.forEach( ( command ) =>
							window.gtag( 'consent', 'default', command )
						);
					},
					order.map( ( key ) => GCM_DEFAULTS[ key ] )
				);

				await expect
					.poll(
						() => page.evaluate( () => window._hsp ),
						order.join()
					)
					.toContainEqual( [ 'revokeCookieConsent' ] );
				expect(
					await lastHubSpotConsent( page ),
					order.join()
				).toEqual( {
					analytics: false,
					advertisement: false,
					functionality: false,
				} );
				await page.close();
			}
		} );

		test( 'lets a preloaded JS API choice beat a region-scoped default denial', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await preloadGcmDefaults( page, [ 'c' ] );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [ { analytics: true } ];
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await lastHubSpotConsent( page ) ).toEqual(
				ANALYTICS_ONLY
			);
		} );

		test( 'lets a JS API choice pushed after load beat a region-scoped default denial', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await preloadGcmDefaults( page, [ 'c' ] );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await lastHubSpotConsent( page ) ).toEqual(
				ANALYTICS_ONLY
			);
		} );

		test( 'ignores a region-scoped Google Consent Mode update grant', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await preloadGcmDefaults( page );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
					region: [ 'US' ],
				} )
			);
			await settle( page );

			expect( requests ).toHaveLength( 0 );
		} );

		test( 'applies a region-scoped Google Consent Mode update denial after an explicit grant', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await preloadGcmDefaults( page );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.gtag( 'consent', 'update', {
					analytics_storage: 'denied',
					region: [ 'DE' ],
				} )
			);

			await expect
				.poll( () => page.evaluate( () => window._hsp ) )
				.toContainEqual( [ 'revokeCookieConsent' ] );
			expect( ( await lastHubSpotConsent( page ) ).analytics ).toBe(
				false
			);
		} );

		test( 'reads the WP Consent API again when a banner defines the consent type later', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );
			await preloadGcmDefaults( page, [ 'b' ] );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				window.wp_consent_type = 'optin';
				window.__consent.statistics = 'allow';
				window.wp_has_consent = ( category ) =>
					window.__consent[ category ] === 'allow';
				document.dispatchEvent(
					new Event( 'wp_consent_type_defined' )
				);
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await lastHubSpotConsent( page ) ).toEqual(
				ANALYTICS_ONLY
			);
		} );

		test( 'undoes a doNotTrack queued on the same page when analytics is granted', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { functionality: true } )
			);
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);

			await expect
				.poll( async () => {
					const hsq = await page.evaluate( () => window._hsq );
					return hsq[ hsq.length - 1 ];
				} )
				.toEqual( [ 'doNotTrack', { track: true } ] );
		} );

		test( 'revokes cookie consent when analytics is withdrawn', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: false } )
			);

			await expect
				.poll( () => page.evaluate( () => window._hsp ) )
				.toContainEqual( [ 'revokeCookieConsent' ] );
			const hsq = await page.evaluate( () => window._hsq );
			expect( hsq[ hsq.length - 1 ] ).toEqual( [ 'doNotTrack' ] );

			await settle( page );
			expect( requests ).toHaveLength( 1 );
		} );
	} );

	test( 'the tracking control in Global Settings saves the setting', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		await setTracking( requestUtils, 'auto' );

		await admin.createNewPost();
		await editor.setPreferences( 'core/edit-post', {
			welcomeGuide: false,
		} );
		await editor.insertBlock( { name: 'hubspot/form' } );
		await editor.openDocumentSettingsSidebar();

		const blockTab = page.getByRole( 'tab', { name: 'Block' } );
		const panelToggle = page.getByRole( 'button', {
			name: 'Global Settings',
		} );

		// Wait for the sidebar to render before deciding whether the Block tab
		// needs selecting.
		await expect( blockTab.or( panelToggle ).first() ).toBeVisible();
		if ( await blockTab.isVisible() ) {
			await blockTab.click();
		}

		await expect( panelToggle ).toBeVisible();
		if (
			( await panelToggle.getAttribute( 'aria-expanded' ) ) === 'false'
		) {
			await panelToggle.click();
		}

		await page
			.getByLabel( 'HubSpot tracking' )
			.selectOption( { label: "Don't load" } );

		await expect
			.poll(
				async () =>
					(
						await requestUtils.rest( {
							path: '/wp/v2/settings',
						} )
					).hubspot_embed_tracking
			)
			.toBe( 'never' );
	} );
} );
