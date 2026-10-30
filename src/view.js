/* global HubSpotFormsV4, IntersectionObserver, dataLayer, localStorage */

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
 * @param {string}      instanceId The form container id.
 * @param {Object}      config     The config render.php wrote for this instance.
 * @param {HTMLElement} [form]     The form, when it is not inside the container.
 */
const applySubmitButton = ( instanceId, config, form ) => {
	const element = document.getElementById( instanceId );
	if ( element?.dataset.hsFormSubmitted === '1' ) {
		return;
	}

	const submitButton = ( form || element )?.querySelector(
		'[type="submit"]'
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
				// The legacy form renders inside an iframe, so its submit
				// control is only reachable through the form HubSpot passes
				// here, which it wraps in jQuery when the page has jQuery.
				onFormReady: ( form ) =>
					applySubmitButton(
						instanceId,
						config,
						form?.jquery ? form.get( 0 ) : form
					),
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

/**
 * Loads HubSpot's embed script once a form is about to scroll into view.
 *
 * The embed script loads reCAPTCHA, which is a large main thread cost, so
 * forms below the fold no longer pay it on page load. render.php puts the
 * script URL on each container; each URL is loaded once.
 */
const loadEmbedScripts = () => {
	const containers = document.querySelectorAll( '[data-embed-src]' );
	const loaded = new Set();

	const load = ( container ) => {
		const src = container.dataset.embedSrc;
		if ( loaded.has( src ) ) {
			return;
		}
		loaded.add( src );

		const script = document.createElement( 'script' );
		script.src = src;
		script.async = true;
		document.body.appendChild( script );
	};

	if ( ! ( 'IntersectionObserver' in window ) ) {
		containers.forEach( load );
		return;
	}

	const observer = new IntersectionObserver(
		( entries ) => {
			entries.forEach( ( entry ) => {
				if ( entry.isIntersecting ) {
					observer.unobserve( entry.target );
					load( entry.target );
				}
			} );
		},
		{ rootMargin: '800px 0px' }
	);

	containers.forEach( ( container ) => observer.observe( container ) );
};

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', loadEmbedScripts );
} else {
	loadEmbedScripts();
}
