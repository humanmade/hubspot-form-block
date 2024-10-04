<?php
/**
 * Plugin Name:       Hubspot Form Block
 * Plugin URI:        https://github.com/humanmade/hubspot-form-block
 * Description:       Hubspot form embed block with configuration options
 * Requires at least: 6.1
 * Requires PHP:      7.0
 * Version:           0.2.2
 * Author:            Human Made Limited
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       hubspot-form-block
 *
 * @package           hubspot-form-block
 */

namespace HM\HubspotFormBlock;

/**
 * Registers the block using the metadata loaded from the `block.json` file.
 * Behind the scenes, it registers also all assets so they can be enqueued
 * through the block editor in the corresponding context.
 *
 * @see https://developer.wordpress.org/reference/functions/register_block_type/
 */
function block_init() {
	register_block_type( __DIR__ . '/build' );
}

add_action( 'init', __NAMESPACE__ . '\\block_init' );

function register_scripts() {
	wp_register_script(
		'hs-forms',
		'https://js.hsforms.net/forms/v2.js',
		[],
		null,
		[ 'strategy' => 'async' ]
	);
}

add_action( 'enqueue_block_assets', __NAMESPACE__ . '\\register_scripts' );

function inject_onload_handler( $tag, $handle ) {
	if ( 'hs-forms' !== $handle ) {
		return $tag;
	}

	$tag = str_replace( '></script>', ' onload="window.dispatchEvent(new CustomEvent(\'hubspotFormsReady\'));"></script>', $tag );

	return $tag;
}

add_filter( 'script_loader_tag', __NAMESPACE__ . '\\inject_onload_handler', 10, 2 );

function enqueue_scripts() {
	$portal_id = get_option( 'hubspot_embed_portal_id' );
	if ( empty( $portal_id ) ) {
		return;
	}

	$region = get_option( 'hubspot_embed_region', 'eu1' );

	wp_enqueue_script(
		'hs-script-loader',
		sprintf( 'https://js-%s.hs-scripts.com/%s.js', $region, $portal_id ),
		[],
		null,
		[
			'strategy' => 'async',
			'in_footer' => true,
		]
	);
}

add_action( 'wp_enqueue_scripts', __NAMESPACE__ . '\\enqueue_scripts' );

function rest_api() {
	register_setting(
		'hubspot_embed',
		'hubspot_embed_portal_id',
		[
			'type' => 'number',
			'sanitize_callback' => 'absint',
			'show_in_rest' => true,
		]
	);
	register_setting(
		'hubspot_embed',
		'hubspot_embed_region',
		[
			'type' => 'string',
			'sanitize_callback' => function ( $value ) {
				if ( in_array( $value, [ 'eu1', 'na1' ], true ) ) {
					return $value;
				}
				return 'eu1';
			},
			'show_in_rest' => true,
			'default' => 'eu1',
		]
	);
}

add_action( 'rest_api_init', __NAMESPACE__ . '\\rest_api' );
