<?php
global $hubspot_form_block_instance_ids;

$portal_id = $attributes['portalId'] ?: get_option( 'hubspot_embed_portal_id' );
$region = $attributes['region'] ?: get_option( 'hubspot_embed_region', 'eu1' );
$form_id = $attributes['formId'] ?: '';

if ( empty( $portal_id ) || empty( $form_id ) ) {
	return;
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

// Add inline message if inner blocks present.
$has_inline_message = (
	! isset( $config['redirectUrl'] ) &&
	! empty( $block->parsed_block['innerBlocks'] ) &&
	trim( $block->parsed_block['innerBlocks'][0]['innerHTML'] ) !== '<p></p>'
);
if ( $has_inline_message ) {
	$inline_message = new WP_HTML_Tag_Processor( $content );
	$inline_message->next_tag( 'div' );
	$inline_message->remove_class( 'wp-block-hubspot-form' );
	$inline_message->add_class( 'wp-block-hubspot-form__inline-message' );
	$inline_message_html = (string) $inline_message;
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
<?php if ( $has_inline_message ) : ?>
<template id="<?php echo esc_attr( $target ); ?>-inline-message"><?php echo $inline_message_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- server-rendered trusted block content ?></template>
<?php endif; ?>
<div <?php echo get_block_wrapper_attributes( $wrapper_attributes ); ?>>
	<div class="wp-block-hubspot-form__loading"></div>
	<noscript>
		<p><?php esc_html_e( 'This form may not be visible due to adblockers, or JavaScript not being enabled.', 'hubspot-form-block' ); ?></p>
	</noscript>
</div>
<?php if ( $has_inline_message && ! empty( $attributes['persistSuccess'] ) ) : ?>
<script type="text/javascript">
	( function () {
		try {
			var cfg = window.hsForms && window.hsForms[ '<?php echo esc_js( $target ); ?>' ];
			if ( ! cfg || ! cfg.persistSuccess || ! cfg.storageKey ) {
				return;
			}
			var paths = [];
			try { paths = JSON.parse( localStorage.getItem( cfg.storageKey ) || '[]' ); } catch ( e ) {}
			if ( ! Array.isArray( paths ) || ! paths.includes( window.location.pathname ) ) {
				return;
			}
			var tmpl = document.getElementById( '<?php echo esc_js( $target ); ?>-inline-message' );
			var el   = document.getElementById( '<?php echo esc_js( $target ); ?>' );
			if ( ! tmpl || ! el ) {
				return;
			}
			var frag = tmpl.content.cloneNode( true );
			frag.querySelectorAll( '.is-hubspot-form-first-submission' ).forEach( function ( n ) {
				n.remove();
			} );
			el.replaceChildren( frag );
			el.removeAttribute( 'data-form-id' );
			el.removeAttribute( 'data-portal-id' );
			el.removeAttribute( 'data-region' );
			el.classList.remove( 'hs-form-html' );
		} catch ( e ) {}
	} )();
</script>
<?php endif; ?>
