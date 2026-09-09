/* global HubSpotFormsV4, dataLayer, localStorage */

/**
 * Sets the label on a form's submit control.
 *
 * The current embed renders a <button>, the legacy embed renders an
 * <input type="submit">, which takes its label from value rather than from
 * its text content.
 *
 * @param {HTMLElement} element Submit control.
 * @param {string}      text    Label to apply.
 */
const setSubmitText = ( element, text ) => {
	if ( element.tagName === 'INPUT' ) {
		element.value = text;
	} else {
		element.textContent = text;
	}
};

/**
 * Applies the block's submit button settings once a form has rendered.
 *
 * @param {string} instanceId The form container id.
 * @param {Object} config     The config render.php wrote for this instance.
 */
const applySubmitButton = ( instanceId, config ) => {
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
		setSubmitText( submitButton, config.submitText );
	}
};

/**
 * Handles a successful submission: analytics, redirect, success message.
 *
 * @param {string} instanceId     The form container id.
 * @param {Object} config         The config render.php wrote for this instance.
 * @param {Object} dataLayerExtra Fields to merge into the dataLayer push.
 */
const handleSuccess = ( instanceId, config, dataLayerExtra ) => {
	window.dataLayer = window.dataLayer || [];

	dataLayer.push( {
		event: config.gtmEventName,
		instanceId,
		source: 'hubspot_form_wordpress_plugin',
		...dataLayerExtra,
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
			const paths = JSON.parse(
				localStorage.getItem( config.storageKey ) || '[]'
			);
			if ( ! paths.includes( window.location.pathname ) ) {
				paths.push( window.location.pathname );
				localStorage.setItem(
					config.storageKey,
					JSON.stringify( paths )
				);
			}
		} catch ( e ) {}
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

	applySubmitButton( instanceId, config );
} );

window.addEventListener( 'hs-form-event:on-submission:success', ( event ) => {
	window.hsForms = window.hsForms || {};

	const form = HubSpotFormsV4.getFormFromEvent( event );
	const instanceId = form.getInstanceId();
	const config = window.hsForms[ instanceId ];

	if ( ! config ) {
		return;
	}

	handleSuccess( instanceId, config, {
		formId: form.getFormId(),
		conversionId: form.getConversionId(),
	} );
} );

/**
 * Builds any forms on the page that use the legacy embed.
 *
 * The current embed script finds its own containers and fires events. The
 * legacy script does neither, so each form is created here from the config
 * render.php wrote, with the same behaviour wired onto its callbacks.
 *
 * hbspt.forms.create has to run after the legacy script has loaded.
 * hsFormsOnReady is HubSpot's queue for that, and it runs a callback pushed
 * after loading straight away, so it is safe whichever order the two arrive
 * in.
 */
const createLegacyForms = () => {
	const forms = window.hsForms || {};

	Object.keys( forms ).forEach( ( instanceId ) => {
		const config = forms[ instanceId ];

		if ( ! config || ! config.legacy || config.created ) {
			return;
		}
		config.created = true;

		window.hsFormsOnReady = window.hsFormsOnReady || [];
		window.hsFormsOnReady.push( () => {
			window.hbspt.forms.create( {
				portalId: config.portalId,
				formId: config.formId,
				region: config.region,
				target: `#${ instanceId }`,
				onFormReady: () => applySubmitButton( instanceId, config ),
				onFormSubmitted: () =>
					handleSuccess( instanceId, config, {
						formId: config.formId,
					} ),
			} );
		} );
	} );
};

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', createLegacyForms );
} else {
	createLegacyForms();
}
