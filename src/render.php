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

// Add inline message if inner blocks present.
if (
	! isset( $config['redirectUrl'] ) &&
	! empty( $block->parsed_block['innerBlocks'] ) &&
	trim( $block->parsed_block['innerBlocks'][0]['innerHTML'] ) !== '<p></p>'
) {
	$inline_message = new WP_HTML_Tag_Processor( $content );
	$inline_message->next_tag( 'div' );
	$inline_message->remove_class( 'wp-block-hubspot-form' );
	$inline_message->add_class( 'wp-block-hubspot-form__inline-message' );
	$config['inlineMessage'] = (string) $inline_message;
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
	<p><?php esc_html_e( 'This form may not be visible due to adblockers, or JavaScript not being enabled.', 'hubspot-form-block' ); ?></p>
</div>
