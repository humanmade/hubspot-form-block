<?php
/**
 * Plugin Name:       Hubspot Form Block
 * Plugin URI:        https://github.com/humanmade/hubspot-form-block
 * Description:       Hubspot form embed block with configuration options
 * Requires at least: 6.1
 * Requires PHP:      7.0
 * Version:           __VERSION__
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

/**
 * Resolves the tracking mode: `consent`, `always` or `never`.
 *
 * @return string
 */
function get_tracking_mode() : string {
	$mode = get_option( 'hubspot_embed_tracking', 'auto' );

	if ( 'auto' === $mode ) {
		$mode = function_exists( 'wp_has_consent' ) ? 'consent' : 'always';
	}

	$mode = apply_filters( 'hubspot_form_block_tracking_mode', $mode );

	return in_array( $mode, [ 'consent', 'always', 'never' ], true ) ? $mode : 'always';
}

/**
 * Builds the URL of the HubSpot tracking script.
 *
 * @param string|int $portal_id        HubSpot portal ID.
 * @param string     $region           HubSpot region.
 * @param int        $business_unit_id Optional business unit ID.
 * @return string
 */
function get_tracker_url( $portal_id, $region, $business_unit_id = 0 ) : string {
	$url = sprintf( 'https://js-%s.hs-scripts.com/%s.js', $region, $portal_id );

	if ( ! empty( $business_unit_id ) ) {
		$url = add_query_arg( 'businessUnitId', $business_unit_id, $url );
	}

	return $url;
}

/**
 * Loads the HubSpot tracking script according to the tracking mode.
 *
 * In `consent` mode the script is not printed. Its URL is passed to the
 * consent loader, which adds it to the page once the visitor consents.
 *
 * @param string $url    Tracking script URL.
 * @param string $handle Script handle used when the tracker is enqueued directly.
 */
function enqueue_tracker( string $url, string $handle ) {
	static $consent_urls = [];

	$mode = get_tracking_mode();

	if ( 'always' === $mode ) {
		wp_enqueue_script(
			$handle,
			$url,
			[],
			null,
			[
				'strategy'  => 'async',
				'in_footer' => true,
			]
		);
		return;
	}

	if ( 'consent' !== $mode ) {
		return;
	}

	$asset_file = __DIR__ . '/build/consent.asset.php';
	$asset      = file_exists( $asset_file )
		? require $asset_file
		: [
			'dependencies' => [],
			'version'      => false,
		];

	wp_enqueue_script(
		'hubspot-form-block-consent',
		plugins_url( 'build/consent.js', __FILE__ ),
		$asset['dependencies'],
		$asset['version'],
		[ 'in_footer' => true ]
	);

	if ( in_array( $url, $consent_urls, true ) ) {
		return;
	}

	$consent_urls[] = $url;

	// Replace the inline config so it holds every URL once, however many
	// times this function is called.
	wp_scripts()->add_data(
		'hubspot-form-block-consent',
		'before',
		[ 'window.hubspotFormBlockTracking = ' . wp_json_encode( [ 'scripts' => $consent_urls ] ) . ';' ]
	);
}

function enqueue_scripts() {
	$portal_id = get_option( 'hubspot_embed_portal_id' );
	if ( empty( $portal_id ) ) {
		return;
	}

	$region           = get_option( 'hubspot_embed_region', 'eu1' );
	$business_unit_id = absint( get_option( 'hubspot_embed_business_unit_id' ) );

	enqueue_tracker( get_tracker_url( $portal_id, $region, $business_unit_id ), 'hs-script-loader' );
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
	register_setting(
		'hubspot_embed',
		'hubspot_embed_business_unit_id',
		[
			'type' => 'integer',
			'sanitize_callback' => 'absint',
			'show_in_rest' => true,
		]
	);
	register_setting(
		'hubspot_embed',
		'hubspot_embed_tracking',
		[
			'type' => 'string',
			'sanitize_callback' => function ( $value ) {
				if ( in_array( $value, [ 'auto', 'consent', 'always', 'never' ], true ) ) {
					return $value;
				}
				return 'auto';
			},
			'show_in_rest' => [
				'schema' => [
					'type' => 'string',
					'enum' => [ 'auto', 'consent', 'always', 'never' ],
				],
			],
			'default' => 'auto',
		]
	);
}

add_action( 'rest_api_init', __NAMESPACE__ . '\\rest_api' );
