/* global DOMParser, HubSpotFormsV4, dataLayer, trustedTypes */

import DOMPurify from 'dompurify';

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
		const policy = trustedTypes.createPolicy( 'purifiedHTML', {
			createHTML: ( input ) => DOMPurify.sanitize( input ),
		} );
		const purifiedHTML = policy.createHTML( config.inlineMessage );
		const doc = parser.parseFromString( purifiedHTML, 'text/html' );
		element.replaceChildren( doc.body.children );
	}
} );
