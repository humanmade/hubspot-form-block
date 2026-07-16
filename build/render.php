<?php
global $hubspot_form_block_instance_ids;

$portal_id        = $attributes['portalId'] ?: get_option( 'hubspot_embed_portal_id' );
$region           = $attributes['region'] ?: get_option( 'hubspot_embed_region', 'eu1' );
$form_id          = $attributes['formId'] ?: '';
$business_unit_id = ! empty( $attributes['businessUnitId'] )
	? absint( $attributes['businessUnitId'] )
	: absint( get_option( 'hubspot_embed_business_unit_id' ) );

if ( empty( $portal_id ) || empty( $form_id ) ) {
	return;
}

// If no global portal ID is set, the main plugin won't have enqueued the HubSpot
// scripts — enqueue them here using the block-level portal ID as a fallback.
if ( empty( get_option( 'hubspot_embed_portal_id' ) ) ) {
	wp_enqueue_script(
		"hs-forms-{$portal_id}",
		sprintf( 'https://js-%s.hsforms.net/forms/embed/developer/%s.js', $region, $portal_id ),
		[ 'hubspot-form-view-script' ],
		null,
		[ 'strategy' => 'async' ]
	);

	$hs_script_url = sprintf( 'https://js-%s.hs-scripts.com/%s.js', $region, $portal_id );
	if ( ! empty( $business_unit_id ) ) {
		$hs_script_url = add_query_arg( 'businessUnitId', $business_unit_id, $hs_script_url );
	}

	wp_enqueue_script(
		"hs-script-loader-{$portal_id}",
		$hs_script_url,
		[],
		null,
		[
			'strategy'  => 'async',
			'in_footer' => true,
		]
	);
}

// Remove empty value attributes.
$attributes = array_filter( $attributes );

// Track the instance ID of each form to ensure no collisions.
$hubspot_form_block_instance_ids = $hubspot_form_block_instance_ids ?? [];
$hubspot_form_block_instance_ids[ $attributes['formId'] ] = isset( $hubspot_form_block_instance_ids[ $attributes['formId'] ] )
	? $hubspot_form_block_instance_ids[ $attributes['formId'] ] + 1
	: 1;
$instance_id = $hubspot_form_block_instance_ids[ $attributes['formId'] ];

// Get a unique identifier for this form instance.
$target = sprintf(
	'hubspot-form-%s-%s',
	$attributes['formId'],
	$instance_id
);

// Generate config object.
$config = [
	'submitButtonClass' => 'wp-element-button hs-button primary large',
];

$optional_config = [
	'redirectUrl' => 'sanitize_url',
	'submitText' => 'sanitize_text_field',
];

foreach ( $optional_config as $key => $callback ) {
	if ( ! empty( $attributes[ $key ] ) ) {
		$config[ $key ] = call_user_func( $callback, $attributes[ $key ] );
	}
}

if ( ! empty( $attributes['persistSuccess'] ) && empty( $config['redirectUrl'] ) ) {
	$config['persistSuccess'] = true;
	$config['storageKey']     = 'hs-form-submitted:' . $form_id;
}

// Detect inline (gated) message inner blocks. The content itself is NOT
// emitted into the page — it is fetched from the unlock REST endpoint after a
// submission so it can't be read from the page source without submitting.
$has_inline_message = (
	! isset( $config['redirectUrl'] ) &&
	! empty( $block->parsed_block['innerBlocks'] ) &&
	trim( $block->parsed_block['innerBlocks'][0]['innerHTML'] ) !== '<p></p>'
);
if ( $has_inline_message ) {
	$config['gated']    = true;
	$config['postId']   = $block->context['postId'] ?? get_the_ID();
	$config['formId']   = $form_id;
	$config['instance'] = $instance_id;
	$config['restUrl']  = rest_url( 'hubspot-form-block/v1/unlock' );

	/**
	 * Filter the message shown when a submission succeeds but the gated content
	 * can't be verified/retrieved in time.
	 *
	 * @param string $message Pending message text.
	 */
	$config['pendingMessage'] = (string) apply_filters(
		'hubspot_form_block_pending_message',
		__( 'Thank you! Your content will be available shortly — please check your email.', 'hubspot-form-block' )
	);
}

// Google Tag Manager event.
$config['gtmEventName'] = empty( $attributes['gtmEventName'] ) ? 'hubspot_form_submit' : $attributes['gtmEventName'];

$wrapper_attributes = [
	'id' => $target,
	'class' => 'hs-form-html',
	'data-region' => $region,
	'data-form-id' => $form_id,
	'data-portal-id' => $portal_id,
];

?>
<script type="text/javascript">
	window.hsForms = window.hsForms || {};
	window.hsForms['<?php echo esc_js( $target ); ?>'] = <?php echo wp_json_encode( $config ); ?>;
</script>
<div <?php echo get_block_wrapper_attributes( $wrapper_attributes ); ?>>
	<div class="wp-block-hubspot-form__loading"></div>
	<noscript>
		<p><?php esc_html_e( 'This form may not be visible due to adblockers, or JavaScript not being enabled.', 'hubspot-form-block' ); ?></p>
	</noscript>
</div>
<?php if ( $has_inline_message && ! empty( $attributes['persistSuccess'] ) ) : ?>
<script type="text/javascript">
	// Returning-visitor no-flash hide: if this page was previously unlocked,
	// hide the form container immediately. view.js then re-fetches the gated
	// content from the unlock endpoint using the stored token. No content is
	// exposed here — this only toggles a CSS class.
	( function () {
		try {
			var cfg = window.hsForms && window.hsForms[ '<?php echo esc_js( $target ); ?>' ];
			if ( ! cfg || ! cfg.persistSuccess || ! cfg.storageKey ) {
				return;
			}
			var entries = [];
			try { entries = JSON.parse( localStorage.getItem( cfg.storageKey ) || '[]' ); } catch ( e ) {}
			if ( ! Array.isArray( entries ) ) {
				return;
			}
			var hit = entries.some( function ( entry ) {
				if ( typeof entry === 'string' ) {
					return entry === window.location.pathname;
				}
				return entry && entry.path === window.location.pathname;
			} );
			if ( ! hit ) {
				return;
			}
			var el = document.getElementById( '<?php echo esc_js( $target ); ?>' );
			if ( el ) {
				el.classList.add( 'is-unlocking' );
			}
		} catch ( e ) {}
	} )();
</script>
<?php endif; ?>
