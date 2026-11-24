/**
 * Loads the HubSpot tracking script once the visitor consents.
 *
 * Consent comes from the `window.hubspotFormBlockConsent` queue and from the
 * WP Consent API once a consent banner has set the consent type. Until either
 * grants a category, nothing loads.
 *
 * At page load the two sources are read together, and a category either one
 * denies stays denied. After that, the latest change wins.
 */
( function () {
	const CATEGORIES = [ 'analytics', 'advertisement', 'functionality' ];
	const WP_CATEGORIES = {
		analytics: 'statistics',
		advertisement: 'marketing',
		functionality: 'preferences',
	};

	// The current choice for each category. Only `true` grants.
	const consent = {};
	let loaded = false;
	// The choice HubSpot was last told about, as JSON.
	let told = '';
	// Whether HubSpot was last told it may track: null until first told.
	let trackingAllowed = null;

	// Reports an error without stopping the code that called this.
	function report( error ) {
		setTimeout( () => {
			throw error;
		} );
	}

	// Returns whether the command was queued.
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

	function current() {
		const value = {};
		CATEGORIES.forEach( ( key ) => {
			value[ key ] = consent[ key ] === true;
		} );
		return value;
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
		const choice = current();

		if ( ! loaded ) {
			if ( ! CATEGORIES.some( ( key ) => choice[ key ] ) ) {
				return;
			}

			// Must be set before the tracking script runs.
			window.disableHubSpotCookieBanner = true;
			window._hsq = window._hsq || [];
			if ( ! pushTo( '_hsp', [ 'setHubSpotConsent', choice ] ) ) {
				return;
			}
			loadScripts();
			loaded = true;
		} else if ( JSON.stringify( choice ) !== told ) {
			pushTo( '_hsp', [ 'setHubSpotConsent', choice ] );
			if ( JSON.parse( told ).analytics && ! choice.analytics ) {
				pushTo( '_hsp', [ 'revokeCookieConsent' ] );
			}
		}
		told = JSON.stringify( choice );

		if ( ! choice.analytics && trackingAllowed !== false ) {
			pushTo( '_hsq', [ 'doNotTrack' ] );
			trackingAllowed = false;
		} else if ( choice.analytics && trackingAllowed !== true ) {
			if (
				trackingAllowed === false ||
				/(?:^|;\s*)__hs_do_not_track=/.test( document.cookie )
			) {
				pushTo( '_hsq', [ 'doNotTrack', { track: true } ] );
			}
			trackingAllowed = true;
		}
	}

	// Copies the boolean values of `partial` into `target`.
	function merge( target, partial ) {
		if ( ! partial || typeof partial !== 'object' ) {
			return;
		}
		CATEGORIES.forEach( ( key ) => {
			if ( typeof partial[ key ] === 'boolean' ) {
				target[ key ] = partial[ key ];
			}
		} );
	}

	// Applies the queue entries in order, then tells HubSpot once. An entry
	// that cannot be read denies everything.
	function readEntries( entries ) {
		for ( let i = 0; i < entries.length; i++ ) {
			try {
				merge( consent, entries[ i ] );
			} catch ( error ) {
				merge( consent, denyAll() );
				report( error );
			}
		}
		apply();
	}

	// Returns the queue's choices so far, in order.
	function initQueue() {
		const queue = ( window.hubspotFormBlockConsent =
			window.hubspotFormBlockConsent || [] );
		const choice = {};

		let length = 0;
		try {
			length = queue.length;
		} catch ( error ) {
			merge( choice, denyAll() );
			report( error );
		}
		for ( let i = 0; i < length; i++ ) {
			try {
				merge( choice, queue[ i ] );
			} catch ( error ) {
				merge( choice, denyAll() );
				report( error );
			}
		}

		try {
			const push =
				typeof queue.push === 'function'
					? queue.push
					: Array.prototype.push;
			queue.push = function ( ...entries ) {
				readEntries( entries );
				return push.apply( this, entries );
			};
		} catch ( error ) {
			report( error );
		}

		return choice;
	}

	function wpConsentType() {
		// A banner that uses the wait-for hook sets the type itself.
		if (
			window.waitfor_consent_hook &&
			typeof window.wp_consent_type === 'undefined'
		) {
			return undefined;
		}
		return typeof window.wp_consent_type !== 'undefined'
			? window.wp_consent_type
			: window.wp_fallback_consent_type;
	}

	// Reads every category from the WP Consent API. Without a consent type no
	// banner manages consent and the API reports everything as granted, so it
	// is ignored.
	function readWpConsent() {
		if ( ! wpConsentType() ) {
			return {};
		}

		const choice = {};
		CATEGORIES.forEach( ( key ) => {
			choice[ key ] = !! window.wp_has_consent( WP_CATEGORIES[ key ] );
		} );
		return choice;
	}

	function denyAll() {
		const choice = {};
		CATEGORIES.forEach( ( key ) => {
			choice[ key ] = false;
		} );
		return choice;
	}

	// A WP Consent API that cannot be read denies everything.
	function safeReadWpConsent() {
		try {
			return readWpConsent();
		} catch ( error ) {
			report( error );
			return denyAll();
		}
	}

	function onWpConsentTypeDefined() {
		merge( consent, safeReadWpConsent() );
		apply();
	}

	// Takes the values the change event names.
	function onWpConsentChange( event ) {
		const detail = ( event && event.detail ) || {};
		const choice = {};

		CATEGORIES.forEach( ( key ) => {
			const value = detail[ WP_CATEGORIES[ key ] ];
			if ( value === 'allow' || value === 'deny' ) {
				choice[ key ] = value === 'allow';
			}
		} );

		merge( consent, choice );
		apply();
	}

	// Returns the WP Consent API's choices so far.
	function initWpConsent() {
		if ( typeof window.wp_has_consent !== 'function' ) {
			return {};
		}

		document.addEventListener(
			'wp_listen_for_consent_change',
			onWpConsentChange
		);
		document.addEventListener(
			'wp_consent_type_defined',
			onWpConsentTypeDefined
		);

		return safeReadWpConsent();
	}

	function init() {
		const sources = [ initQueue(), initWpConsent() ];

		// A category is granted only if a source grants it and none denies it.
		CATEGORIES.forEach( ( key ) => {
			const values = sources
				.map( ( source ) => source[ key ] )
				.filter( ( value ) => typeof value === 'boolean' );

			if ( values.length ) {
				consent[ key ] = values.every( Boolean );
			}
		} );

		apply();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
