/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Internal dependencies
 */
const { insertBlockAndOpenGlobalSettings } = require( './helpers' );

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
 * @param {Object}                          options.initial     Categories that start out as allowed, such as `{ statistics: 'allow' }`.
 */
function stubWpConsentApi(
	page,
	{ waitForHook = false, noType = false, initial = {} } = {}
) {
	return page.addInitScript(
		( { hook, untyped, consent } ) => {
			window.__consent = { ...consent };
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
		{ hook: waitForHook, untyped: noType, consent: initial }
	);
}

/**
 * Makes the loader treat the WP Consent API's typeless answer as a rank-0
 * grant, as it does when the mode is `auto`. The page's inline config sets
 * `strict` from the "Wait for consent" setting, so it is overridden as it is
 * assigned.
 *
 * @param {import('@playwright/test').Page} page
 */
function allowUntypedWpConsent( page ) {
	return page.addInitScript( () => {
		let config;
		Object.defineProperty( window, 'hubspotFormBlockTracking', {
			configurable: true,
			get: () => config,
			set: ( value ) => {
				config = { ...value, strict: false };
			},
		} );
	} );
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
		await page.route( /hsforms\.net\/forms\/embed/, ( route ) =>
			route.fulfill( {
				contentType: 'application/javascript',
				body: 'window.__hsEmbedLoaded = true;',
			} )
		);
		const embedRequest = page.waitForRequest(
			/hsforms\.net\/forms\/embed/
		);

		await page.goto( postUrl );
		await expect( page.locator( '[data-embed-src]' ) ).toBeAttached();
		await settle( page );
		await embedRequest;

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

		test( 'keeps reading Google Consent Mode after window.dataLayer is replaced', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				window.dataLayer = [];
				function gtag() {
					window.dataLayer.push( arguments );
				}
				gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'keeps reading Google Consent Mode after the dataLayer push is replaced', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			const lengths = await page.evaluate( () => {
				const dl = window.dataLayer;
				dl.push = function () {
					return Array.prototype.push.apply( dl, arguments );
				};
				const before = window.dataLayer.length;
				function gtag() {
					window.dataLayer.push( arguments );
				}
				gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
				return [ before, window.dataLayer.length ];
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( lengths[ 1 ] ).toBeGreaterThan( lengths[ 0 ] );
		} );

		test( 'does not loop when a replaced dataLayer push calls the previous one', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			const result = await page.evaluate( () => {
				const dl = window.dataLayer;
				const prev = dl.push;
				let calls = 0;
				dl.push = function () {
					calls++;
					return prev.apply( dl, arguments );
				};
				const before = dl.length;
				function gtag() {
					window.dataLayer.push( arguments );
				}
				gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
				return { calls, delta: dl.length - before };
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( result ).toEqual( { calls: 1, delta: 1 } );
		} );

		test( 'a dataLayer push still works when a consent entry cannot be read', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );

			await page.goto( postUrl );
			await settle( page );

			const result = await page.evaluate( () => {
				const bad = {
					get 0() {
						throw new Error( 'unreadable entry' );
					},
				};
				const before = window.dataLayer.length;
				let threw = false;
				try {
					window.dataLayer.push( bad );
				} catch ( error ) {
					threw = true;
				}
				return {
					threw,
					delta: window.dataLayer.length - before,
				};
			} );
			expect( result ).toEqual( { threw: false, delta: 1 } );

			await page.evaluate( () => {
				function gtag() {
					window.dataLayer.push( arguments );
				}
				gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( errors ).toEqual( [
				expect.stringContaining( 'unreadable entry' ),
			] );
		} );

		test( 'keeps the tracker off if a consent source throws during start-up, until an explicit grant', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			await page.addInitScript( () => {
				window.wp_consent_type = 'optin';
				window.wp_has_consent = () => {
					throw new Error( 'consent source failed' );
				};
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				function gtag() {
					window.dataLayer.push( arguments );
				}
				gtag( 'consent', 'default', {
					analytics_storage: 'granted',
					ad_storage: 'granted',
					functionality_storage: 'granted',
				} );
			} );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( errors ).toEqual( [
				expect.stringContaining( 'consent source failed' ),
			] );
		} );

		test( 'works when the page declared dataLayer with var', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.route(
				( url ) => url.href === postUrl,
				async ( route ) => {
					const response = await route.fetch();
					const body = ( await response.text() ).replace(
						/<head[^>]*>/i,
						( head ) =>
							`${ head }<script>var dataLayer = [];</script>`
					);
					await route.fulfill( { response, body } );
				}
			);

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			expect(
				await page.evaluate(
					() =>
						Object.getOwnPropertyDescriptor( window, 'dataLayer' )
							.configurable
				)
			).toBe( false );

			await page.evaluate( () => {
				function gtag() {
					window.dataLayer.push( arguments );
				}
				gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'does not reapply a superseded grant when the dataLayer is copied', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = window.dataLayer || [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
					ad_storage: 'granted',
					functionality_storage: 'granted',
				} );
				window.hubspotFormBlockConsent = [
					{
						analytics: false,
						advertisement: false,
						functionality: false,
					},
				];
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				window.dataLayer = window.dataLayer.slice();
			} );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				window.dataLayer = window.dataLayer.concat( [] );
			} );
			await settle( page );
			expect( requests ).toHaveLength( 0 );
		} );

		test( 'treats an unreadable Consent Mode entry after a grant as a denial during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			await page.addInitScript( () => {
				window.dataLayer = window.dataLayer || [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
					ad_storage: 'granted',
					functionality_storage: 'granted',
				} );
				window.dataLayer.push( {
					0: 'consent',
					1: 'update',
					get 2() {
						throw new Error( 'unreadable' );
					},
				} );
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );
			expect( errors ).toEqual( [
				expect.stringContaining( 'unreadable' ),
			] );
		} );

		test( 'keeps watching an array whose entries cannot be read', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			const threw = await page.evaluate( () => {
				const arr = [];
				Object.defineProperty( arr, 0, {
					get() {
						throw new Error( 'unreadable' );
					},
					configurable: true,
					enumerable: true,
				} );
				try {
					window.dataLayer = arr;
				} catch ( error ) {
					return true;
				}
				return false;
			} );
			expect( threw ).toBe( false );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				function gtag() {
					window.dataLayer.push( arguments );
				}
				gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( errors ).toEqual( [
				expect.stringContaining( 'unreadable' ),
			] );
		} );

		test( 'still reads the JS API queue after an unreadable preloaded entry', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [
					{
						get analytics() {
							throw new Error( 'unreadable' );
						},
					},
				];
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( errors ).toEqual( [
				expect.stringContaining( 'unreadable' ),
			] );
		} );

		test( 'keeps an existing window.dataLayer accessor', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				let backing = [];
				window.setterCalls = 0;
				Object.defineProperty( window, 'dataLayer', {
					configurable: true,
					enumerable: true,
					get: () => backing,
					set: ( value ) => {
						window.setterCalls++;
						backing = value;
					},
				} );
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				function gtag() {
					window.dataLayer.push( arguments );
				}
				gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
			} );
			await expect.poll( () => requests.length ).toBe( 1 );

			const result = await page.evaluate( () => {
				const replacement = [];
				window.dataLayer = replacement;
				return {
					setterCalls: window.setterCalls,
					same: window.dataLayer === replacement,
				};
			} );
			expect( result.setterCalls ).toBeGreaterThanOrEqual( 1 );
			expect( result.same ).toBe( true );

			await page.evaluate( () =>
				window.dataLayer.push( [
					'consent',
					'update',
					{
						analytics_storage: 'denied',
						ad_storage: 'denied',
						functionality_storage: 'denied',
					},
				] )
			);

			await expect
				.poll( async () => {
					const hsq = await page.evaluate( () => window._hsq );
					return hsq[ hsq.length - 1 ];
				} )
				.toEqual( [ 'doNotTrack' ] );
		} );

		test( 'reads a dataLayer whose push cannot become an accessor', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				Object.defineProperty( window.dataLayer, 'push', {
					value: Array.prototype.push,
					writable: true,
					configurable: false,
				} );
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () =>
				window.dataLayer.push( [
					'consent',
					'update',
					{
						analytics_storage: 'granted',
						ad_storage: 'granted',
						functionality_storage: 'granted',
					},
				] )
			);
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.dataLayer.push( [
					'consent',
					'update',
					{
						analytics_storage: 'denied',
						ad_storage: 'denied',
						functionality_storage: 'denied',
					},
				] )
			);

			await expect
				.poll( async () => {
					const hsq = await page.evaluate( () => window._hsq );
					return hsq[ hsq.length - 1 ];
				} )
				.toEqual( [ 'doNotTrack' ] );
		} );

		test( 'denies when the JS API queue cannot be read during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = new Proxy( [], {
					get( target, key ) {
						if ( key === 'length' ) {
							throw new Error( 'unreadable' );
						}
						return Reflect.get( target, key );
					},
				} );
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'default', {
					analytics_storage: 'granted',
					ad_storage: 'granted',
					functionality_storage: 'granted',
				} );
			} );

			await page.goto( postUrl );
			await settle( page );

			expect( requests ).toHaveLength( 0 );
			expect( errors ).toEqual( [
				expect.stringContaining( 'unreadable' ),
			] );
		} );

		test( 'applies a replacement dataLayer only after reading all of it', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				const arr = [
					[
						'consent',
						'update',
						{
							analytics_storage: 'granted',
							ad_storage: 'granted',
							functionality_storage: 'granted',
						},
					],
				];
				Object.defineProperty( arr, 1, {
					enumerable: true,
					configurable: true,
					get() {
						window.dataLayer.push( { event: 'telemetry' } );
						return [
							'consent',
							'update',
							{
								analytics_storage: 'denied',
								ad_storage: 'denied',
								functionality_storage: 'denied',
							},
						];
					},
				} );
				window.dataLayer = arr;
			} );

			await settle( page );
			expect( requests ).toHaveLength( 0 );
		} );

		test( 'replays a preloaded queue whose push cannot be replaced', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			await page.addInitScript( () => {
				const q = [
					{
						analytics: false,
						advertisement: false,
						functionality: false,
					},
				];
				Object.defineProperty( q, 'push', {
					get: () => Array.prototype.push,
					set() {
						throw new Error( 'locked' );
					},
					configurable: false,
				} );
				window.hubspotFormBlockConsent = q;
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
					ad_storage: 'granted',
					functionality_storage: 'granted',
				} );
			} );

			await page.goto( postUrl );
			await settle( page );

			expect( requests ).toHaveLength( 0 );
			expect( errors ).toEqual( [ expect.stringContaining( 'locked' ) ] );
		} );

		test( "still stops tracking when HubSpot's command queue throws", async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () => {
				window._hsp = window._hsp || [];
				window._hsp.push = () => {
					throw new Error( 'hsp' );
				};
				window.hubspotFormBlockConsent.push( { analytics: false } );
			} );

			await expect
				.poll( () => page.evaluate( () => window._hsq ) )
				.toContainEqual( [ 'doNotTrack' ] );
			expect( errors.length ).toBeGreaterThan( 0 );
			errors.forEach( ( message ) =>
				expect( message ).toContain( 'hsp' )
			);
		} );

		test( 'reads a denial pushed by a forwarding push before it forwards', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				const dl = window.dataLayer;
				const prev = dl.push;
				dl.push = function ( ...args ) {
					prev.call( dl, [
						'consent',
						'update',
						{
							analytics_storage: 'denied',
							ad_storage: 'denied',
							functionality_storage: 'denied',
						},
					] );
					return prev.apply( dl, args );
				};
				window.dataLayer.push( [
					'consent',
					'update',
					{
						analytics_storage: 'granted',
						ad_storage: 'granted',
						functionality_storage: 'granted',
					},
				] );
			} );

			await settle( page );
			expect( requests ).toHaveLength( 0 );
		} );

		test( 'lets an explicit choice from a healthy source win when another source throws during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			await page.addInitScript( () => {
				window.wp_consent_type = 'optin';
				window.wp_has_consent = () => {
					throw new Error( 'consent source failed' );
				};
				window.hubspotFormBlockConsent = [ { analytics: true } ];
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( errors ).toEqual( [
				expect.stringContaining( 'consent source failed' ),
			] );
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

		test( 'lets a denial win over a grant of equal rank during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
				window.hubspotFormBlockConsent = [ { analytics: false } ];
			} );

			await page.goto( postUrl );
			await settle( page );

			expect( requests ).toHaveLength( 0 );
		} );

		test( 'lets a queued denial win over a WP Consent API grant during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, {
				initial: { statistics: 'allow' },
			} );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [ { analytics: false } ];
			} );

			await page.goto( postUrl );
			await settle( page );

			expect( requests ).toHaveLength( 0 );
		} );

		test( 'lets a later grant in one queue win over an earlier denial', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [
					{ analytics: false },
					{ analytics: true },
				];
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'lets a later grant in the dataLayer win over an earlier denial', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.gtag( 'consent', 'update', {
					analytics_storage: 'denied',
				} );
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'lets a queued denial win over a dataLayer denial followed by a grant', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.dataLayer = [];
				window.gtag = function () {
					window.dataLayer.push( arguments );
				};
				window.hubspotFormBlockConsent = [ { analytics: false } ];
				window.gtag( 'consent', 'update', {
					analytics_storage: 'denied',
				} );
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} );
			} );

			await page.goto( postUrl );
			await settle( page );

			expect( requests ).toHaveLength( 0 );
		} );

		test( 'lets the latest of two equal-rank changes win after start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await preloadGcmDefaults( page );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.gtag( 'consent', 'update', {
					analytics_storage: 'granted',
				} )
			);
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: false } )
			);

			await expect
				.poll(
					async () => ( await lastHubSpotConsent( page ) ).analytics
				)
				.toBe( false );
		} );

		test( 'applies the entries of one queue push together', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push(
					{ analytics: true },
					{ analytics: false }
				)
			);
			await settle( page );

			expect( requests ).toHaveLength( 0 );
		} );

		test( 'applies the entries of one dataLayer push together', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await page.evaluate( () => {
				function args() {
					return arguments;
				}

				window.dataLayer.push(
					args( 'consent', 'update', {
						analytics_storage: 'granted',
					} ),
					args( 'consent', 'update', {
						analytics_storage: 'denied',
					} )
				);
			} );
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

		test( 'ignores the WP Consent API answer when no consent type is set', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );
			expect(
				await page.evaluate(
					() => window.hubspotFormBlockTracking.strict
				)
			).toBe( true );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);

			await expect.poll( () => requests.length ).toBe( 1 );
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
			await stubWpConsentApi( page, {
				initial: { statistics: 'allow' },
			} );
			await preloadGcmDefaults( page );

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

			await page.evaluate( () => {
				window.wp_consent_type = 'optin';
				document.dispatchEvent(
					new Event( 'wp_consent_type_defined' )
				);
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'lets a Google Consent Mode default deny what an untyped WP Consent API reports as granted', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );
			await allowUntypedWpConsent( page );
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

		test( "leaves consent to HubSpot's banner when no consent tool is present", async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );
			await allowUntypedWpConsent( page );

			await page.goto( postUrl );
			await expect.poll( () => requests.length ).toBe( 1 );
			await settle( page );

			expect(
				await page.evaluate( () => window.disableHubSpotCookieBanner )
			).toBeUndefined();
			const hsp = await page.evaluate( () => window._hsp || [] );
			expect(
				hsp.filter( ( entry ) => entry[ 0 ] === 'setHubSpotConsent' )
			).toHaveLength( 0 );
			const hsq = await page.evaluate( () => window._hsq || [] );
			expect( hsq ).not.toContainEqual( [ 'doNotTrack' ] );
		} );

		test( "takes over from HubSpot's banner when a consent tool denies", async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );
			await allowUntypedWpConsent( page );

			await page.goto( postUrl );
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: false } )
			);

			await expect
				.poll( () => page.evaluate( () => window._hsp ) )
				.toContainEqual( [ 'revokeCookieConsent' ] );
			expect( await lastHubSpotConsent( page ) ).toEqual( {
				analytics: false,
				advertisement: true,
				functionality: true,
			} );
			expect( await page.evaluate( () => window._hsq ) ).toContainEqual( [
				'doNotTrack',
			] );
		} );

		test( "takes over from HubSpot's banner when a consent tool grants", async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );
			await allowUntypedWpConsent( page );

			await page.goto( postUrl );
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);

			await expect
				.poll( () => page.evaluate( () => window._hsp ) )
				.toContainEqual( [
					'setHubSpotConsent',
					{
						analytics: true,
						advertisement: true,
						functionality: true,
					},
				] );
			expect(
				await page.evaluate( () => window._hsp )
			).not.toContainEqual( [ 'revokeCookieConsent' ] );
		} );

		test( "turns HubSpot's banner off when a Consent Mode default is present with the untyped answer", async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );
			await allowUntypedWpConsent( page );
			await preloadGcmDefaults( page, [ 'd' ] );

			await page.goto( postUrl );
			await expect.poll( () => requests.length ).toBe( 1 );

			expect(
				await page.evaluate( () => window.disableHubSpotCookieBanner )
			).toBe( true );
			expect( await lastHubSpotConsent( page ) ).toEqual( {
				analytics: true,
				advertisement: true,
				functionality: true,
			} );
		} );

		test( 'treats a WP Consent API change event before the consent type is defined as a choice', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { waitForHook: true } );

			await page.goto( postUrl );
			await page.evaluate( () =>
				document.dispatchEvent(
					new CustomEvent( 'wp_listen_for_consent_change', {
						detail: { statistics: 'allow' },
					} )
				)
			);

			await expect.poll( () => requests.length ).toBe( 1 );
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
						await allowUntypedWpConsent( page );
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
				await allowUntypedWpConsent( page );
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
			await allowUntypedWpConsent( page );
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

		test( "applies a withdrawal before the page's push runs", async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( {
					analytics: true,
					advertisement: true,
					functionality: true,
				} )
			);
			await expect.poll( () => requests.length ).toBe( 1 );
			expect(
				await page.evaluate( () =>
					( window._hsq || [] ).some(
						( command ) =>
							Array.isArray( command ) &&
							command[ 0 ] === 'doNotTrack'
					)
				)
			).toBe( false );

			await page.evaluate( () => {
				const dl = window.dataLayer;
				const prev = dl.push;
				window.sawDoNotTrack = null;
				dl.push = function ( ...args ) {
					window.sawDoNotTrack = ( window._hsq || [] ).some(
						( command ) =>
							Array.isArray( command ) &&
							command[ 0 ] === 'doNotTrack' &&
							command.length === 1
					);
					return prev.apply( dl, args );
				};
				window.dataLayer.push( [
					'consent',
					'update',
					{ analytics_storage: 'denied' },
				] );
			} );

			expect( await page.evaluate( () => window.sawDoNotTrack ) ).toBe(
				true
			);
		} );

		test( "does not load the tracker when HubSpot's consent command can't be queued", async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			await page.addInitScript( () => {
				window._hsp = {
					push() {
						throw new Error( 'hsp' );
					},
				};
			} );

			await page.goto( postUrl );
			await page.evaluate( () =>
				window.hubspotFormBlockConsent.push( { analytics: true } )
			);

			await settle( page );
			expect( requests ).toHaveLength( 0 );
			expect( errors.length ).toBeGreaterThan( 0 );
			errors.forEach( ( message ) =>
				expect( message ).toContain( 'hsp' )
			);
		} );
	} );

	test( 'the tracking control in Global Settings saves the setting', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		await setTracking( requestUtils, 'auto' );

		await insertBlockAndOpenGlobalSettings( admin, editor, page );

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
