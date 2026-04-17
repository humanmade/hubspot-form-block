/* global HubSpotFormsV4, dataLayer, localStorage */

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

	const template = document.getElementById(
		`${ instanceId }-inline-message`
	);
	if ( template && template.content ) {
		const element = document.getElementById( instanceId );
		element.replaceChildren( template.content.cloneNode( true ) );
	}

	if ( config.persistSuccess && config.storageKey ) {
		try {
			localStorage.setItem(
				config.storageKey + ':' + window.location.pathname,
				'1'
			);
		} catch ( e ) {}
	}
} );
