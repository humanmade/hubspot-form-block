/**
 * WordPress dependencies
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Internal dependencies
 */
const {
	insertBlockAndOpenGlobalSettings,
	stubTracker,
	settle,
} = require( './helpers' );

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
	hubspot_embed_tracking: 'always',
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
 * @param {string} mode         One of always, consent or never.
 */
function setTracking( requestUtils, mode ) {
	return setSettings( requestUtils, { hubspot_embed_tracking: mode } );
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
 * Returns the last value HubSpot was told about with setHubSpotConsent.
 *
 * @param {import('@playwright/test').Page} page
 */
async function lastHubSpotConsent( page ) {
	const hsp = await page.evaluate( () => window._hsp );
	const calls = hsp.filter( ( entry ) => entry[ 0 ] === 'setHubSpotConsent' );
	return calls[ calls.length - 1 ][ 1 ];
}

/**
 * Dispatches a WP Consent API change event with the given detail.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object}                          detail Category answers, such as `{ statistics: 'allow' }`.
 */
function changeWpConsent( page, detail ) {
	return page.evaluate( ( answers ) => {
		Object.assign( window.__consent, answers );
		document.dispatchEvent(
			new CustomEvent( 'wp_listen_for_consent_change', {
				detail: answers,
			} )
		);
	}, detail );
}

/**
 * Pushes a choice onto the JS API queue.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object}                          choice Category values, such as `{ analytics: true }`.
 */
function pushConsent( page, choice ) {
	return page.evaluate(
		( value ) => window.hubspotFormBlockConsent.push( value ),
		choice
	);
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

	test( 'loads the tracker on page load when no setting is saved', async ( {
		page,
		requestUtils,
	} ) => {
		// Deleting a setting that is not stored is rejected, so store one first.
		await setTracking( requestUtils, 'never' );
		await setTracking( requestUtils, null );
		try {
			const requests = await stubTracker( page );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect(
				await page.evaluate( () => window.hubspotFormBlockTracking )
			).toBeUndefined();
		} finally {
			await setTracking( requestUtils, 'always' );
		}
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

			await pushConsent( page, { analytics: true } );

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
				window.hubspotFormBlockConsent = [ { analytics: true } ];
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await lastHubSpotConsent( page ) ).toEqual(
				ANALYTICS_ONLY
			);
		} );

		test( 'loads the tracker with doNotTrack when only functionality is granted', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [ { functionality: true } ];
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await page.evaluate( () => window._hsq ) ).toContainEqual( [
				'doNotTrack',
			] );
		} );

		test( 'undoes a doNotTrack queued on the same page when analytics is granted', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await pushConsent( page, { functionality: true } );
			await expect.poll( () => requests.length ).toBe( 1 );

			await pushConsent( page, { analytics: true } );

			await expect
				.poll( async () => {
					const hsq = await page.evaluate( () => window._hsq );
					return hsq[ hsq.length - 1 ];
				} )
				.toEqual( [ 'doNotTrack', { track: true } ] );
		} );

		test( 'revokes cookie consent and sends doNotTrack when analytics is withdrawn', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );

			await page.goto( postUrl );
			await pushConsent( page, { analytics: true } );
			await expect.poll( () => requests.length ).toBe( 1 );

			await pushConsent( page, { analytics: false } );

			await expect
				.poll( () => page.evaluate( () => window._hsp ) )
				.toContainEqual( [ 'revokeCookieConsent' ] );
			const hsq = await page.evaluate( () => window._hsq );
			expect( hsq[ hsq.length - 1 ] ).toEqual( [ 'doNotTrack' ] );

			await settle( page );
			expect( requests ).toHaveLength( 1 );
		} );

		test( "still stops tracking when HubSpot's command queue throws", async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );

			await page.goto( postUrl );
			await pushConsent( page, { analytics: true } );
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
			await pushConsent( page, { analytics: true } );

			await settle( page );
			expect( requests ).toHaveLength( 0 );
			expect( errors.length ).toBeGreaterThan( 0 );
			errors.forEach( ( message ) =>
				expect( message ).toContain( 'hsp' )
			);
		} );

		test( 'denies for an unreadable queue entry, and a later explicit grant still works', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			// The WP Consent API grants analytics, so the denial can only come
			// from the unreadable entry.
			await stubWpConsentApi( page, {
				initial: { statistics: 'allow' },
			} );
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

			await pushConsent( page, { analytics: true } );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( errors ).toEqual( [
				expect.stringContaining( 'unreadable' ),
			] );
		} );

		test( 'reads a preloaded queue whose push cannot be replaced', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			const errors = [];
			page.on( 'pageerror', ( error ) => errors.push( error.message ) );
			// The WP Consent API grants analytics, so the denial can only come
			// from the queue.
			await stubWpConsentApi( page, {
				initial: { statistics: 'allow' },
			} );
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
			} );

			await page.goto( postUrl );
			await settle( page );

			expect( requests ).toHaveLength( 0 );
			expect( errors ).toEqual( [ expect.stringContaining( 'locked' ) ] );
		} );

		test( 'follows a WP Consent API opt-in banner', async ( { page } ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await changeWpConsent( page, { statistics: 'allow' } );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await page.evaluate( () => window._hsp ) ).toContainEqual( [
				'setHubSpotConsent',
				ANALYTICS_ONLY,
			] );

			await changeWpConsent( page, { statistics: 'deny' } );

			await expect
				.poll( () => page.evaluate( () => window._hsp ) )
				.toContainEqual( [ 'revokeCookieConsent' ] );
			const hsq = await page.evaluate( () => window._hsq );
			expect( hsq[ hsq.length - 1 ] ).toEqual( [ 'doNotTrack' ] );
		} );

		test( 'only reads the categories named by a WP Consent API change', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, {
				initial: { statistics: 'allow' },
			} );

			await page.goto( postUrl );
			await expect.poll( () => requests.length ).toBe( 1 );

			// The API still reports statistics as allowed, but the queue
			// withdrew it and the change event does not name it.
			await pushConsent( page, { analytics: false } );
			await changeWpConsent( page, { marketing: 'allow' } );

			await expect
				.poll( () => lastHubSpotConsent( page ) )
				.toEqual( {
					analytics: false,
					advertisement: true,
					functionality: false,
				} );
		} );

		test( 'waits for the WP Consent API consent type, then reads it when it is defined', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { waitForHook: true } );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await page.evaluate( () => {
				window.wp_consent_type = 'optin';
				window.wp_has_consent = ( category ) =>
					category === 'statistics';
				document.dispatchEvent(
					new Event( 'wp_consent_type_defined' )
				);
			} );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await lastHubSpotConsent( page ) ).toEqual(
				ANALYTICS_ONLY
			);
		} );

		test( 'denies when the WP Consent API throws at page load, until an explicit grant', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await page.addInitScript( () => {
				window.wp_consent_type = 'optin';
				window.wp_has_consent = () => {
					throw new Error( 'consent source failed' );
				};
				window.hubspotFormBlockConsent = [ { analytics: true } ];
			} );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await pushConsent( page, { analytics: true } );

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'denies when the WP Consent API throws once the consent type is defined', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { waitForHook: true } );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [ { analytics: true } ];
			} );

			await page.goto( postUrl );
			await expect.poll( () => requests.length ).toBe( 1 );

			await page.evaluate( () => {
				window.wp_has_consent = () => {
					throw new Error( 'consent source failed' );
				};
				window.wp_consent_type = 'optin';
				document.dispatchEvent(
					new Event( 'wp_consent_type_defined' )
				);
			} );

			await expect
				.poll( () => page.evaluate( () => window._hsp ) )
				.toContainEqual( [ 'revokeCookieConsent' ] );
			expect( await lastHubSpotConsent( page ) ).toEqual( {
				analytics: false,
				advertisement: false,
				functionality: false,
			} );
			const hsq = await page.evaluate( () => window._hsq );
			expect( hsq[ hsq.length - 1 ] ).toEqual( [ 'doNotTrack' ] );
		} );

		test( 'ignores the WP Consent API answer when no consent type is set', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, { noType: true } );

			await page.goto( postUrl );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await pushConsent( page, { analytics: true } );

			await expect.poll( () => requests.length ).toBe( 1 );
		} );

		test( 'lets a WP Consent API denial win over a queued grant during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, {
				initial: { preferences: 'allow' },
			} );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [
					{ analytics: true, functionality: true },
				];
			} );

			await page.goto( postUrl );

			// Only functionality is granted by both sources.
			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await lastHubSpotConsent( page ) ).toEqual( {
				analytics: false,
				advertisement: false,
				functionality: true,
			} );
		} );

		test( 'lets a queued denial win over a WP Consent API grant during start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page, {
				initial: { statistics: 'allow', preferences: 'allow' },
			} );
			await page.addInitScript( () => {
				window.hubspotFormBlockConsent = [
					{ analytics: false, functionality: true },
				];
			} );

			await page.goto( postUrl );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await lastHubSpotConsent( page ) ).toEqual( {
				analytics: false,
				advertisement: false,
				functionality: true,
			} );
		} );

		test( 'lets the latest change win after start-up', async ( {
			page,
		} ) => {
			const requests = await stubTracker( page );
			await stubWpConsentApi( page );

			await page.goto( postUrl );
			await changeWpConsent( page, { statistics: 'deny' } );
			await settle( page );
			expect( requests ).toHaveLength( 0 );

			await pushConsent( page, { analytics: true } );

			await expect.poll( () => requests.length ).toBe( 1 );
			expect( await lastHubSpotConsent( page ) ).toEqual(
				ANALYTICS_ONLY
			);
		} );
	} );

	test( 'the tracking control in Global Settings saves the setting', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		await setTracking( requestUtils, 'always' );

		await insertBlockAndOpenGlobalSettings( admin, editor, page );

		const select = page.getByLabel( 'HubSpot tracking' );
		await expect( select.locator( 'option' ) ).toHaveText( [
			'Load on every page',
			'Wait for an external consent banner',
			"Don't load HubSpot tracking",
		] );

		const savedValue = async () =>
			(
				await requestUtils.rest( {
					path: '/wp/v2/settings',
				} )
			).hubspot_embed_tracking;

		await select.selectOption( {
			label: 'Wait for an external consent banner',
		} );
		await expect.poll( savedValue ).toBe( 'consent' );

		await select.selectOption( { label: "Don't load HubSpot tracking" } );
		await expect.poll( savedValue ).toBe( 'never' );
	} );

	test( 'the tracking control suggests waiting for consent when the WP Consent API is active', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		await setTracking( requestUtils, 'always' );
		// The editor's inline script assigns this global, so a read-only
		// property keeps the value set here.
		await page.addInitScript( () => {
			Object.defineProperty( window, 'hubspotFormBlockEditor', {
				value: { wpConsentApi: true },
				writable: false,
				configurable: false,
			} );
		} );

		await insertBlockAndOpenGlobalSettings( admin, editor, page );

		const hint = page.getByText(
			'A consent plugin that uses the WP Consent API is active.'
		);
		await expect( hint ).toBeVisible();

		await page
			.getByLabel( 'HubSpot tracking' )
			.selectOption( { label: 'Wait for an external consent banner' } );

		await expect( hint ).toBeHidden();
	} );
} );
