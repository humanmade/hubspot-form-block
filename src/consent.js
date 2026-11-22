/**
 * Loads the HubSpot tracking script once the visitor consents.
 *
 * Consent comes from three sources: the `window.hubspotFormBlockConsent`
 * queue, Google Consent Mode commands pushed to `window.dataLayer`, and the
 * WP Consent API. The most recent change wins for each category.
 */
( function () {
	const CATEGORIES = [ 'analytics', 'advertisement', 'functionality' ];
	const GCM_KEYS = {
		analytics_storage: 'analytics',
		ad_storage: 'advertisement',
		functionality_storage: 'functionality',
	};
	const WP_CATEGORIES = {
		analytics: 'statistics',
		advertisement: 'marketing',
		functionality: 'preferences',
	};

	const consent = {
		analytics: false,
		advertisement: false,
		functionality: false,
	};
	let loaded = false;
	let pushedState = '';
	let wasAnalytics = false;
	// Whether HubSpot has last been told it may track: null until first told.
	let trackingAllowed = null;

	function pushTo( name, command ) {
		window[ name ] = window[ name ] || [];
		window[ name ].push( command );
	}

	function loadScripts() {
		const config = window.hubspotFormBlockTracking || {};

		( config.scripts || [] ).forEach( ( src ) => {
			const script = document.createElement( 'script' );
			script.async = true;
			script.src = src;
			document.body.appendChild( script );
		} );
	}

	function apply() {
		if ( ! loaded ) {
			if ( ! CATEGORIES.some( ( key ) => consent[ key ] ) ) {
				return;
			}

			// Must be set before the tracking script runs.
			window.disableHubSpotCookieBanner = true;
			window._hsq = window._hsq || [];
			pushTo( '_hsp', [ 'setHubSpotConsent', { ...consent } ] );
			loadScripts();
			loaded = true;
			pushedState = JSON.stringify( consent );
		} else if ( JSON.stringify( consent ) !== pushedState ) {
			pushTo( '_hsp', [ 'setHubSpotConsent', { ...consent } ] );
			if ( wasAnalytics && ! consent.analytics ) {
				pushTo( '_hsp', [ 'revokeCookieConsent' ] );
			}
			pushedState = JSON.stringify( consent );
		}

		if ( ! consent.analytics && trackingAllowed !== false ) {
			pushTo( '_hsq', [ 'doNotTrack' ] );
			trackingAllowed = false;
		} else if ( consent.analytics && trackingAllowed !== true ) {
			if ( /(?:^|;\s*)__hs_do_not_track=/.test( document.cookie ) ) {
				pushTo( '_hsq', [ 'doNotTrack', { track: true } ] );
			}
			trackingAllowed = true;
		}

		wasAnalytics = consent.analytics;
	}

	function update( partial ) {
		if ( ! partial || typeof partial !== 'object' ) {
			return;
		}

		CATEGORIES.forEach( ( key ) => {
			if ( typeof partial[ key ] === 'boolean' ) {
				consent[ key ] = partial[ key ];
			}
		} );

		apply();
	}

	function initQueue() {
		const queue = ( window.hubspotFormBlockConsent =
			window.hubspotFormBlockConsent || [] );

		queue.slice().forEach( update );
		queue.push = function ( ...entries ) {
			entries.forEach( update );
			return queue.length;
		};
	}

	// gtag() pushes an `arguments` object, so entries are not arrays.
	function fromConsentMode( entry ) {
		if (
			! entry ||
			typeof entry !== 'object' ||
			entry[ 0 ] !== 'consent' ||
			( entry[ 1 ] !== 'default' && entry[ 1 ] !== 'update' ) ||
			! entry[ 2 ] ||
			typeof entry[ 2 ] !== 'object'
		) {
			return;
		}

		// The visitor's region is unknown, so region-scoped commands only
		// apply when they deny consent.
		const regional = !! entry[ 2 ].region;
		const partial = {};

		Object.keys( GCM_KEYS ).forEach( ( key ) => {
			const value = entry[ 2 ][ key ];
			if ( value === 'denied' || ( value === 'granted' && ! regional ) ) {
				partial[ GCM_KEYS[ key ] ] = value === 'granted';
			}
		} );

		update( partial );
	}

	function initDataLayer() {
		const dataLayer = ( window.dataLayer = window.dataLayer || [] );

		Array.prototype.slice.call( dataLayer ).forEach( fromConsentMode );

		const originalPush = dataLayer.push;
		dataLayer.push = function () {
			Array.prototype.forEach.call( arguments, fromConsentMode );
			return originalPush.apply( window.dataLayer, arguments );
		};
	}

	function readWpConsent() {
		const partial = {};

		CATEGORIES.forEach( ( key ) => {
			partial[ key ] = !! window.wp_has_consent( WP_CATEGORIES[ key ] );
		} );

		update( partial );
	}

	function initWpConsent() {
		if ( typeof window.wp_has_consent !== 'function' ) {
			return;
		}

		document.addEventListener(
			'wp_listen_for_consent_change',
			readWpConsent
		);

		// Until a consent banner sets the type, the API reports consent for
		// everything.
		if (
			window.waitfor_consent_hook &&
			typeof window.wp_consent_type === 'undefined'
		) {
			document.addEventListener(
				'wp_consent_type_defined',
				readWpConsent,
				{
					once: true,
				}
			);
			return;
		}

		readWpConsent();
	}

	function init() {
		initQueue();
		initDataLayer();
		initWpConsent();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
