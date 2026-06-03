/* global HubSpotFormsV4, dataLayer, localStorage */

const PENDING_RETRIES = 5;
const REQUEST_TIMEOUT = 10000;

/**
 * Resolve after `ms` milliseconds.
 *
 * @param {number} ms Delay.
 * @return {Promise<void>} Promise.
 */
function wait( ms ) {
	return new Promise( ( resolve ) => setTimeout( resolve, ms ) );
}

/**
 * Exponential backoff (capped) for a given attempt.
 *
 * @param {number} attempt Zero-based attempt index.
 * @return {number} Delay in milliseconds.
 */
function backoff( attempt ) {
	return Math.min( 1000 * Math.pow( 2, attempt ), 8000 );
}

/**
 * Read the persisted-unlock entries for a storage key.
 *
 * @param {string} key Storage key.
 * @return {Array} Entries (objects `{ path, token }`, or legacy path strings).
 */
function readStore( key ) {
	try {
		const value = JSON.parse( localStorage.getItem( key ) || '[]' );
		return Array.isArray( value ) ? value : [];
	} catch ( e ) {
		return [];
	}
}

/**
 * Return the stored unlock token for the current path, if any.
 *
 * @param {Object} config Form config.
 * @return {{ found: boolean, token: ?string }} Lookup result.
 */
function storedUnlockForPath( config ) {
	if ( ! config.storageKey ) {
		return { found: false, token: null };
	}
	const entry = readStore( config.storageKey ).find( ( item ) => {
		if ( typeof item === 'string' ) {
			return item === window.location.pathname;
		}
		return item && item.path === window.location.pathname;
	} );
	if ( ! entry ) {
		return { found: false, token: null };
	}
	return {
		found: true,
		token: typeof entry === 'object' ? entry.token || null : null,
	};
}

/**
 * Persist the unlock token for the current path.
 *
 * @param {string}  key   Storage key.
 * @param {?string} token Unlock token (may be null in best-effort mode).
 */
function persistUnlock( key, token ) {
	try {
		const entries = readStore( key ).filter(
			( item ) =>
				item &&
				typeof item === 'object' &&
				item.path !== window.location.pathname
		);
		entries.push( {
			path: window.location.pathname,
			token: token || null,
		} );
		localStorage.setItem( key, JSON.stringify( entries ) );
	} catch ( e ) {}
}

/**
 * Extract an email value from HubSpot's form field values, regardless of the
 * (array or object) shape the SDK returns.
 *
 * @param {*} values Field values from `form.getFormFieldValues()`.
 * @return {string} Email, or empty string.
 */
function extractEmail( values ) {
	if ( ! values ) {
		return '';
	}
	if ( Array.isArray( values ) ) {
		const field = values.find( ( item ) =>
			/email/i.test( item?.name || '' )
		);
		return field?.value || '';
	}
	if ( typeof values === 'object' ) {
		return values.email || '';
	}
	return '';
}

/**
 * Inject server-rendered gated content into the form container.
 *
 * @param {HTMLElement} element       Form container.
 * @param {string}      html          Trusted server-rendered HTML.
 * @param {boolean}     isRepeatVisit Whether to strip first-submission-only content.
 */
function injectMessage( element, html, isRepeatVisit ) {
	const template = document.createElement( 'template' );
	template.innerHTML = html;
	if ( isRepeatVisit ) {
		template.content
			.querySelectorAll( '.is-hubspot-form-first-submission' )
			.forEach( ( node ) => node.remove() );
	}
	element.classList.remove( 'is-unlocking', 'hs-form-html' );
	element.removeAttribute( 'data-form-id' );
	element.removeAttribute( 'data-portal-id' );
	element.removeAttribute( 'data-region' );
	element.replaceChildren( template.content.cloneNode( true ) );
}

/**
 * Show the graceful "available shortly" message in the container.
 *
 * @param {HTMLElement} element Form container.
 * @param {Object}      config  Form config.
 */
function showPendingMessage( element, config ) {
	element.classList.remove( 'is-unlocking' );
	if ( ! config.pendingMessage ) {
		return;
	}
	const paragraph = document.createElement( 'p' );
	paragraph.className = 'wp-block-hubspot-form__pending';
	paragraph.textContent = config.pendingMessage;
	element.replaceChildren( paragraph );
}

/**
 * Fetch gated content from the unlock endpoint, polling while the server
 * reports a pending verification, then inject it (or a fallback message).
 *
 * @param {Object}  config                Form config.
 * @param {string}  instanceId            Form container id.
 * @param {Object}  payload               Extra request fields.
 * @param {string}  [payload.email]       Submitted email.
 * @param {?string} [payload.unlockToken] Repeat-visit token.
 */
async function unlock( config, instanceId, payload = {} ) {
	const element = document.getElementById( instanceId );
	if ( ! element ) {
		return;
	}

	const isRepeatVisit = !! payload.unlockToken;
	element.dataset.hsFormSubmitted = '1';
	element.classList.add( 'is-unlocking' );

	for ( let attempt = 0; attempt < PENDING_RETRIES; attempt++ ) {
		const controller = new AbortController();
		const timer = setTimeout( () => controller.abort(), REQUEST_TIMEOUT );
		let response;

		try {
			response = await fetch( config.restUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( {
					postId: config.postId,
					formId: config.formId,
					instance: config.instance,
					email: payload.email || '',
					unlockToken: payload.unlockToken || '',
				} ),
				signal: controller.signal,
			} );
		} catch ( e ) {
			clearTimeout( timer );
			await wait( backoff( attempt ) );
			continue;
		}
		clearTimeout( timer );

		// Verification still in progress server-side — back off and retry.
		if ( response.status === 202 ) {
			await wait( backoff( attempt ) );
			continue;
		}

		// No gated content for this instance — leave the form in place.
		if ( response.status === 204 ) {
			element.classList.remove( 'is-unlocking' );
			return;
		}

		if ( ! response.ok ) {
			break;
		}

		const data = await response.json().catch( () => ( {} ) );
		if ( data && data.html ) {
			injectMessage( element, data.html, isRepeatVisit );
			if ( config.persistSuccess && config.storageKey ) {
				persistUnlock( config.storageKey, data.unlockToken );
			}
			return;
		}
		break;
	}

	showPendingMessage( element, config );
}

window.addEventListener( 'hs-form-event:on-ready', ( event ) => {
	window.hsForms = window.hsForms || {};
	const form = HubSpotFormsV4.getFormFromEvent( event );
	const instanceId = form.getInstanceId();
	const config = window.hsForms[ instanceId ];

	if ( ! config ) {
		return;
	}

	const element = document.getElementById( instanceId );
	if ( element?.dataset.hsFormSubmitted === '1' ) {
		return;
	}

	const submitButton = document.querySelector(
		`#${ instanceId } [type="submit"]`
	);
	if ( ! submitButton ) {
		return;
	}
	if ( config.submitButtonClass ) {
		submitButton.classList.add( ...config.submitButtonClass.split( ' ' ) );
	}
	if ( config.submitText ) {
		submitButton.textContent = config.submitText;
	}
} );

window.addEventListener(
	'hs-form-event:on-submission:success',
	async ( event ) => {
		window.dataLayer = window.dataLayer || [];
		window.hsForms = window.hsForms || {};

		const form = HubSpotFormsV4.getFormFromEvent( event );
		const instanceId = form.getInstanceId();
		const config = window.hsForms[ instanceId ];

		if ( ! config ) {
			return;
		}

		dataLayer.push( {
			event: config.gtmEventName,
			formId: form.getFormId(),
			instanceId,
			source: 'hubspot_form_wordpress_plugin',
			conversionId: form.getConversionId(),
		} );

		if ( config.redirectUrl ) {
			window.location.href = config.redirectUrl;
			return;
		}

		if ( ! config.gated ) {
			return;
		}

		let email = '';
		try {
			email = extractEmail( await form.getFormFieldValues() );
		} catch ( e ) {}

		unlock( config, instanceId, { email } );
	}
);

// On load, re-fetch gated content for any persisted (returning-visitor) pages.
function unlockPersistedForms() {
	window.hsForms = window.hsForms || {};
	Object.keys( window.hsForms ).forEach( ( instanceId ) => {
		const config = window.hsForms[ instanceId ];
		if ( ! config || ! config.gated || ! config.persistSuccess ) {
			return;
		}
		const { found, token } = storedUnlockForPath( config );
		if ( ! found ) {
			return;
		}
		unlock( config, instanceId, { unlockToken: token || '' } );
	} );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', unlockPersistedForms );
} else {
	unlockPersistedForms();
}
