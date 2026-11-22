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
 * When every accepted value comes from the WP Consent API with no consent
 * type, no consent tool is in charge. The tracker then loads with HubSpot's
 * own banner left on and no consent passed to it, until another source
 * reports a choice.
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
	let batchDepth = 0;
	let loaded = false;
	// Whether the tracker was loaded with no consent tool, leaving consent to
	// HubSpot's own banner.
	let leftToHubSpot = false;
	let pushedState = '';
	let wasAnalytics = false;
	// Whether HubSpot has last been told it may track: null until first told.
	let trackingAllowed = null;

	// Returns whether the command was queued. Errors are reported, so a
	// failing command does not stop the ones after it.
	function pushTo( name, command ) {
		try {
			window[ name ] = window[ name ] || [];
			window[ name ].push( command );
			return true;
		} catch ( error ) {
			report( error );
			return false;
		}
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

	// Whether every accepted value is the WP Consent API's answer with no
	// consent type, so no consent tool manages consent.
	function noConsentTool() {
		return CATEGORIES.every(
			( key ) => state[ key ].rank <= RANK_NO_BANNER
		);
	}

	function apply() {
		if ( ! loaded ) {
			if ( ! CATEGORIES.some( ( key ) => consent[ key ] ) ) {
				return;
			}

			// With no consent tool, HubSpot's own banner decides, if the portal
			// has one.
			if ( noConsentTool() ) {
				loadScripts();
				loaded = true;
				leftToHubSpot = true;
				wasAnalytics = consent.analytics;
				return;
			}

			// Must be set before the tracking script runs.
			window.disableHubSpotCookieBanner = true;
			window._hsq = window._hsq || [];
			if ( ! pushTo( '_hsp', [ 'setHubSpotConsent', { ...consent } ] ) ) {
				return;
			}
			loadScripts();
			loaded = true;
			pushedState = JSON.stringify( consent );
		} else {
			if ( leftToHubSpot ) {
				if ( noConsentTool() ) {
					return;
				}
				leftToHubSpot = false;
			}

			if ( JSON.stringify( consent ) !== pushedState ) {
				pushTo( '_hsp', [ 'setHubSpotConsent', { ...consent } ] );
				if ( wasAnalytics && ! consent.analytics ) {
					pushTo( '_hsp', [ 'revokeCookieConsent' ] );
				}
				pushedState = JSON.stringify( consent );
			}
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

	// Whether consent takes back something HubSpot has been told it may do.
	function withdraws() {
		if ( ! loaded ) {
			return false;
		}
		// While HubSpot's banner decides, any denial from a consent tool counts.
		if ( leftToHubSpot ) {
			return (
				! noConsentTool() &&
				CATEGORIES.some( ( key ) => ! consent[ key ] )
			);
		}
		const told = JSON.parse( pushedState );
		return CATEGORIES.some( ( key ) => told[ key ] && ! consent[ key ] );
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

		if ( ! initialising && batchDepth === 0 ) {
			apply();
		}
	}

	// Runs the updates in `fn`, then applies the result once. A batch started
	// inside another applies nothing until the outer one ends.
	function batch( fn ) {
		batchDepth++;
		try {
			fn();
		} finally {
			batchDepth--;
			if ( ! initialising && batchDepth === 0 ) {
				try {
					apply();
				} catch ( error ) {
					report( error );
				}
			}
		}
	}

	// Throws the error outside the current call, so it is reported without
	// stopping the caller.
	function report( error ) {
		setTimeout( () => {
			throw error;
		} );
	}

	function denyAll( rank ) {
		const partial = {};
		CATEGORIES.forEach( ( key ) => {
			partial[ key ] = false;
		} );
		update( partial, rank );
	}

	// Reads each entry of `list` with `read`, then applies the result once. An
	// entry that cannot be read counts as an explicit denial, and a list that
	// cannot be read as a failed source. Errors are reported and never reach
	// the caller.
	function readEntries( list, read ) {
		try {
			batch( () => {
				let length = 0;
				try {
					length = list.length;
				} catch ( error ) {
					denyAll( RANK_REGION_DEFAULT );
					report( error );
				}
				for ( let i = 0; i < length; i++ ) {
					try {
						read( list[ i ] );
					} catch ( error ) {
						denyAll( RANK_CHOICE );
						report( error );
					}
				}
			} );
		} catch ( error ) {
			report( error );
		}
	}

	function readQueueEntry( entry ) {
		update( entry, RANK_CHOICE );
	}

	function initQueue() {
		const queue = ( window.hubspotFormBlockConsent =
			window.hubspotFormBlockConsent || [] );

		try {
			queue.push = function ( ...entries ) {
				readEntries( entries, readQueueEntry );
				return queue.length;
			};
		} catch ( error ) {
			report( error );
		}
		readEntries( queue, readQueueEntry );
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

	// Consent Mode entries already read, so a copied array, or a push that
	// forwards to an earlier push, does not read them again.
	const seen = new WeakSet();

	function readConsentModeEntry( entry ) {
		if ( entry && typeof entry === 'object' ) {
			if ( seen.has( entry ) ) {
				return;
			}
			seen.add( entry );
		}
		fromConsentMode( entry );
	}

	// Returns a push that reads consent commands, then calls `push`. A
	// withdrawal is applied before `push` runs. Anything else is applied once
	// `push` returns, so commands it pushes on the way count too.
	function wrapPush( push ) {
		return function ( ...entries ) {
			let result;
			batch( () => {
				readEntries( entries, readConsentModeEntry );
				if ( withdraws() ) {
					apply();
				}
				result = push.apply( this, entries );
			} );
			return result;
		};
	}

	// Makes `push` on a dataLayer array read consent commands first. A push
	// set later is wrapped too. An accessor already there is left as it is.
	function hookPush( dataLayer ) {
		let push = wrapPush( dataLayer.push );
		const descriptor = Object.getOwnPropertyDescriptor( dataLayer, 'push' );

		if ( ! descriptor || ! ( descriptor.get || descriptor.set ) ) {
			try {
				Object.defineProperty( dataLayer, 'push', {
					configurable: true,
					enumerable: descriptor ? descriptor.enumerable : false,
					get: () => push,
					set: ( value ) => {
						if ( typeof value === 'function' && value !== push ) {
							push = wrapPush( value );
						}
					},
				} );
				return;
			} catch ( error ) {}
		}

		// A push that cannot become an accessor is replaced once.
		dataLayer.push = push;
	}

	const watched = new WeakSet();

	// Reads the commands already in a dataLayer array and the ones pushed to it
	// later.
	function watchDataLayer( dataLayer ) {
		if ( ! Array.isArray( dataLayer ) || watched.has( dataLayer ) ) {
			return;
		}
		watched.add( dataLayer );

		try {
			hookPush( dataLayer );
		} catch ( error ) {
			report( error );
		}

		readEntries( dataLayer, readConsentModeEntry );
	}

	// Watches arrays assigned to window.dataLayer later. An accessor the page
	// already defined keeps working, with its value watched after each write.
	// This is skipped when the page declared dataLayer with `var`.
	function watchDataLayerAssignments() {
		const descriptor =
			Object.getOwnPropertyDescriptor( window, 'dataLayer' ) || {};

		if ( !! descriptor.get !== !! descriptor.set ) {
			return;
		}

		let value = window.dataLayer;
		const get = descriptor.get || ( () => value );
		const set =
			descriptor.set ||
			( ( next ) => {
				value = next;
			} );

		try {
			Object.defineProperty( window, 'dataLayer', {
				configurable: true,
				enumerable: descriptor.enumerable !== false,
				get,
				set: ( next ) => {
					set.call( window, next );
					watchDataLayer( get.call( window ) );
				},
			} );
		} catch ( error ) {}
	}

	function initDataLayer() {
		if ( typeof window.dataLayer === 'undefined' ) {
			window.dataLayer = [];
		}

		watchDataLayer( window.dataLayer );
		watchDataLayerAssignments();
	}

	// Reads every category from the WP Consent API. Without a consent type no
	// banner manages consent and the API reports everything as granted, so
	// those values get the lowest rank, or are skipped when the site chose to
	// wait for consent.
	function readWpConsent() {
		const type =
			typeof window.wp_consent_type !== 'undefined'
				? window.wp_consent_type
				: window.wp_fallback_consent_type;

		// A site that waits for consent ignores the answer given when no banner
		// manages consent.
		if ( ! type && ( window.hubspotFormBlockTracking || {} ).strict ) {
			return;
		}

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
	// If `fn` throws, the store denies every category with the rank of a
	// region-scoped default, so a default grant cannot load the tracker but an
	// explicit choice can.
	function replay( fn ) {
		let store = createStore();

		current = store;
		try {
			fn();
		} catch ( error ) {
			store = createStore();
			CATEGORIES.forEach( ( key ) => {
				store[ key ] = { value: false, rank: RANK_REGION_DEFAULT };
			} );
			report( error );
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
