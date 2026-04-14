/* global DOMParser, HubSpotFormsV4, dataLayer, trustedTypes */

import DOMPurify from 'dompurify';

const EMBED_IFRAME_ATTRIBUTES = [
	'allow',
	'allowfullscreen',
	'frameborder',
	'scrolling',
	'referrerpolicy',
];

/**
 * Returns true when `src` points to a host that is present in (or a
 * subdomain of) one of the trusted host domains.
 *
 * @param {string}   src          The iframe `src` attribute value.
 * @param {string[]} trustedHosts Array of trusted host domains.
 * @return {boolean} Whether the iframe src is trusted.
 */
const isTrustedIframeSrc = ( src, trustedHosts ) => {
	if ( ! trustedHosts?.length ) {
		return false;
	}
	try {
		const url = new URL( src, window.location.origin );
		if ( url.protocol !== 'https:' && url.protocol !== 'http:' ) {
			return false;
		}
		const host = url.hostname.toLowerCase();
		return trustedHosts.some(
			( domain ) => host === domain || host.endsWith( `.${ domain }` )
		);
	} catch {
		return false;
	}
};

window.addEventListener( 'hs-form-event:on-ready', ( event ) => {
	window.hsForms = window.hsForms || {};
	const form = HubSpotFormsV4.getFormFromEvent( event );
	const instanceId = form.getInstanceId();
	const config = window.hsForms[ instanceId ];

	if ( ! config ) {
		return;
	}

	const submitButton = document.querySelector(
		`#${ instanceId } [type="submit"]`
	);
	if ( config.submitButtonClass ) {
		submitButton.classList.add( ...config.submitButtonClass.split( ' ' ) );
	}
	if ( config.submitText ) {
		submitButton.textContent = config.submitText;
	}
} );

window.addEventListener( 'hs-form-event:on-submission:success', ( event ) => {
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

	if ( config.inlineMessage ) {
		const element = document.getElementById( instanceId );
		const parser = new DOMParser();
		const trustedIframeHosts = Array.isArray( config.trustedIframeHosts )
			? config.trustedIframeHosts
			: [];
		const sanitizeOptions =
			trustedIframeHosts.length > 0
				? {
						ADD_TAGS: [ 'iframe' ],
						ADD_ATTR: EMBED_IFRAME_ATTRIBUTES,
				  }
				: undefined;
		const policy = trustedTypes.createPolicy( 'purifiedHTML', {
			createHTML: ( input ) =>
				DOMPurify.sanitize( input, sanitizeOptions ),
		} );
		const purifiedHTML = policy.createHTML( config.inlineMessage );
		const doc = parser.parseFromString( purifiedHTML, 'text/html' );
		// Second pass: enforce the trusted-host allowlist for any iframes
		// that DOMPurify let through. DOMPurify's URI check ensures the
		// `src` has a safe scheme but does not validate the hostname.
		if ( trustedIframeHosts.length > 0 ) {
			doc.querySelectorAll( 'iframe' ).forEach( ( iframe ) => {
				const src = iframe.getAttribute( 'src' ) || '';
				if ( ! isTrustedIframeSrc( src, trustedIframeHosts ) ) {
					iframe.remove();
				}
			} );
		}
		element.replaceChildren( ...doc.body.children );
	}
} );
