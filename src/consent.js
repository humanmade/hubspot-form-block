/**
 * Loads the HubSpot tracking script once the visitor consents.
 *
 * Consent comes from three sources: the `window.hubspotFormBlockConsent`
 * queue, Google Consent Mode commands pushed to `window.dataLayer`, and the
 * WP Consent API.
 *
 * Each category keeps the value and rank of its latest accepted change. A
 * change applies only if its rank is at least the stored rank, so the result
 * does not depend on the order in which sources are read. From weakest to
 * strongest: the WP Consent API with no consent type, a Google Consent Mode
 * default, a region-scoped Google Consent Mode default (denials only), and
 * explicit choices. Explicit choices are queue entries, Google Consent Mode
 * updates, and the WP Consent API once a consent type is set. Between equal
 * ranks the most recent change wins.
 *
 * At start-up each source is replayed into its own store first, in its own
 * order. The stores are then merged: the higher rank wins and, between equal
 * ranks, a denial wins, because the order of the sources is unknown.
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

	const RANK_NO_BANNER = 0;
	const RANK_DEFAULT = 1;
	const RANK_REGION_DEFAULT = 2;
	const RANK_CHOICE = 3;

	function createStore() {
		const store = {};
		CATEGORIES.forEach( ( key ) => {
			store[ key ] = { value: false, rank: -1 };
		} );
		return store;
	}

	// The latest accepted value and rank for each category.
	const state = createStore();
	// The store that updates are written to. During start-up this is a
	// temporary store for the source being read.
	let current = state;
	// The accepted values, as HubSpot is told about them.
	const consent = {};
	CATEGORIES.forEach( ( key ) => {
		consent[ key ] = false;
	} );
	let initialising = true;
	let batching = false;
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

	function update( partial, rank ) {
		if ( ! partial || typeof partial !== 'object' ) {
			return;
		}

		CATEGORIES.forEach( ( key ) => {
			if (
				typeof partial[ key ] !== 'boolean' ||
				rank < current[ key ].rank
			) {
				return;
			}

			current[ key ] = { value: partial[ key ], rank };
			if ( current === state ) {
				consent[ key ] = partial[ key ];
			}
		} );

		if ( ! initialising && ! batching ) {
			apply();
		}
	}

	// Runs the updates in `fn`, then applies the result once.
	function batch( fn ) {
		batching = true;
		try {
			fn();
		} finally {
			batching = false;
		}

		if ( ! initialising ) {
			apply();
		}
	}

	function initQueue() {
		const queue = ( window.hubspotFormBlockConsent =
			window.hubspotFormBlockConsent || [] );

		queue.slice().forEach( ( entry ) => update( entry, RANK_CHOICE ) );
		queue.push = function ( ...entries ) {
			batch( () =>
				entries.forEach( ( entry ) => update( entry, RANK_CHOICE ) )
			);
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
		let rank = RANK_CHOICE;
		if ( entry[ 1 ] === 'default' ) {
			rank = regional ? RANK_REGION_DEFAULT : RANK_DEFAULT;
		}
		const partial = {};

		Object.keys( GCM_KEYS ).forEach( ( key ) => {
			const value = entry[ 2 ][ key ];

			if ( value === 'denied' || ( value === 'granted' && ! regional ) ) {
				partial[ GCM_KEYS[ key ] ] = value === 'granted';
			}
		} );

		update( partial, rank );
	}

	function initDataLayer() {
		const dataLayer = ( window.dataLayer = window.dataLayer || [] );

		Array.prototype.slice.call( dataLayer ).forEach( fromConsentMode );

		const originalPush = dataLayer.push;
		dataLayer.push = function () {
			batch( () =>
				Array.prototype.forEach.call( arguments, fromConsentMode )
			);
			return originalPush.apply( window.dataLayer, arguments );
		};
	}

	// Reads every category from the WP Consent API. Without a consent type no
	// banner manages consent and the API reports everything as granted, so
	// those values get the lowest rank.
	function readWpConsent() {
		const type =
			typeof window.wp_consent_type !== 'undefined'
				? window.wp_consent_type
				: window.wp_fallback_consent_type;

		const partial = {};

		CATEGORIES.forEach( ( key ) => {
			partial[ key ] = !! window.wp_has_consent( WP_CATEGORIES[ key ] );
		} );

		update( partial, type ? RANK_CHOICE : RANK_NO_BANNER );
	}

	// Takes the values from the change event's detail.
	function readWpConsentChange( event ) {
		const detail = ( event && event.detail ) || {};
		const partial = {};

		CATEGORIES.forEach( ( key ) => {
			const value = detail[ WP_CATEGORIES[ key ] ];
			if ( value === 'allow' || value === 'deny' ) {
				partial[ key ] = value === 'allow';
			}
		} );

		update( partial, RANK_CHOICE );
	}

	function initWpConsent() {
		if ( typeof window.wp_has_consent !== 'function' ) {
			return;
		}

		document.addEventListener(
			'wp_listen_for_consent_change',
			readWpConsentChange
		);
		document.addEventListener( 'wp_consent_type_defined', readWpConsent );

		// Until a consent banner sets the type, the API reports consent for
		// everything.
		if (
			window.waitfor_consent_hook &&
			typeof window.wp_consent_type === 'undefined'
		) {
			return;
		}

		readWpConsent();
	}

	// Runs `fn` with its updates written to a new store, and returns the store.
	function replay( fn ) {
		const store = createStore();

		current = store;
		try {
			fn();
		} finally {
			current = state;
		}

		return store;
	}

	// Takes the higher rank for each category, and a denial between equal ranks.
	function merge( stores ) {
		CATEGORIES.forEach( ( key ) => {
			stores.forEach( ( store ) => {
				const entry = store[ key ];

				if (
					entry.rank > state[ key ].rank ||
					( entry.rank >= 0 &&
						entry.rank === state[ key ].rank &&
						! entry.value )
				) {
					state[ key ] = { ...entry };
				}
			} );
			consent[ key ] = state[ key ].value;
		} );
	}

	function init() {
		try {
			merge( [
				replay( initQueue ),
				replay( initDataLayer ),
				replay( initWpConsent ),
			] );
		} finally {
			initialising = false;
		}

		apply();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
