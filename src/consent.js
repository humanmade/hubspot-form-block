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
	// Categories set explicitly, which a Google Consent Mode default must not
	// override.
	const explicit = new Set();
	let initialising = true;
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
			if (
				trackingAllowed === false ||
				/(?:^|;\s*)__hs_do_not_track=/.test( document.cookie )
			) {
				pushTo( '_hsq', [ 'doNotTrack', { track: true } ] );
			}
			trackingAllowed = true;
		}

		wasAnalytics = consent.analytics;
	}

	function update( partial, { isDefault = false } = {} ) {
		if ( ! partial || typeof partial !== 'object' ) {
			return;
		}

		CATEGORIES.forEach( ( key ) => {
			if ( typeof partial[ key ] !== 'boolean' ) {
				return;
			}

			if ( isDefault && explicit.has( key ) ) {
				return;
			}

			consent[ key ] = partial[ key ];
			if ( ! isDefault ) {
				explicit.add( key );
			}
		} );

		if ( ! initialising ) {
			apply();
		}
	}

	function initQueue() {
		const queue = ( window.hubspotFormBlockConsent =
			window.hubspotFormBlockConsent || [] );

		queue.slice().forEach( ( entry ) => update( entry ) );
		queue.push = function ( ...entries ) {
			entries.forEach( ( entry ) => update( entry ) );
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

		update( partial, { isDefault: entry[ 1 ] === 'default' } );
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

	// Reads the given HubSpot categories from the WP Consent API.
	function readWpConsent( keys = CATEGORIES ) {
		const partial = {};

		keys.forEach( ( key ) => {
			partial[ key ] = !! window.wp_has_consent( WP_CATEGORIES[ key ] );
		} );

		update( partial );
	}

	// Reads only the categories named in the change event's detail.
	function readWpConsentChange( event ) {
		const changed = Object.keys( ( event && event.detail ) || {} );

		readWpConsent(
			CATEGORIES.filter( ( key ) =>
				changed.includes( WP_CATEGORIES[ key ] )
			)
		);
	}

	function initWpConsent() {
		if ( typeof window.wp_has_consent !== 'function' ) {
			return;
		}

		document.addEventListener(
			'wp_listen_for_consent_change',
			readWpConsentChange
		);

		// Until a consent banner sets the type, the API reports consent for
		// everything.
		if (
			window.waitfor_consent_hook &&
			typeof window.wp_consent_type === 'undefined'
		) {
			document.addEventListener(
				'wp_consent_type_defined',
				() => readWpConsent(),
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

		initialising = false;
		apply();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
