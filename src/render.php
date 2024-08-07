<?php
global $hubspot_form_block_instance_ids;

$portal_id = $attributes['portalId'] ?: get_option( 'hubspot_embed_portal_id' );
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
	'portalId' => $portal_id,
	'formId' => $form_id,
	'locale' => mb_substr( get_locale(), 0, 2 ),
	'target' => sprintf( '#%s', $target ),
	'formInstanceId' => $instance_id,
	'submitButtonClass' => 'wp-element-button hs-button primary large',
];

$optional_config = [
	'redirectUrl',
	'submitText',
	'goToWebinarWebinarKey',
	'sfdcCampaignId',
];

foreach ( $optional_config as $key ) {
	if ( ! empty( $attributes[ $key ] ) ) {
		$config[ $key ] = $attributes[ $key ];
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
$gtm_event_name = empty( $attributes['gtmEventName'] ) ? 'hubspot_form_submit' : $attributes['gtmEventName'];

?>
<div <?php echo get_block_wrapper_attributes( [ 'id' => $target ] ); ?>>
	<p><?php esc_html_e( 'This form may not be visible due to adblockers, or JavaScript not being enabled.', 'hubspot-form-block' ); ?></p>
</div>
<script type="text/javascript">
	(function(){
		window.dataLayer = window.dataLayer || [];
		var init = function () {
			hbspt.forms.create( Object.assign( {
				onFormReady: function ( $form ) {
					var event = new CustomEvent( 'hubspotOnFormReady', {
						detail: {
							form: $form,
						},
					} );
					window.dispatchEvent( event );
				},
				onFormSubmitted: function () {
					dataLayer.push( {
						event: '<?php echo esc_js( $gtm_event_name ); ?>',
						formId: '<?php echo esc_js( $attributes['formId'] ); ?>',
						source: 'hubspot_form_wordpress_plugin',
					} );
				},
			}, <?php echo wp_json_encode( $config ) ?> ) );
		}
		if ( window.hbspt ) {
			init();
		} else {
			window.addEventListener( 'hubspotFormsReady', init );
		}
 	})();
</script>
