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

	if ( ! in_array( $mode, [ 'consent', 'always', 'never' ], true ) ) {
		$mode = function_exists( 'wp_has_consent' ) ? 'consent' : 'always';
	}

	return $mode;
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

/**
 * Declares WP Consent API compliance and registers HubSpot's tracker cookies.
 *
 * Nothing is registered when the tracker never loads.
 */
function register_consent_api() {
	$mode = get_tracking_mode();

	if ( ! function_exists( 'wp_has_consent' ) || 'never' === $mode ) {
		return;
	}

	if ( 'consent' === $mode ) {
		add_filter( 'wp_consent_api_registered_' . plugin_basename( __FILE__ ), '__return_true' );
	}

	if ( ! function_exists( 'wp_add_cookie_info' ) ) {
		return;
	}

	$six_months = __( '6 months', 'hubspot-form-block' );
	$cookies    = [
		[ '__hstc', 'statistics', $six_months, __( 'Main HubSpot tracking cookie. Holds the domain, first, last and current visit times, and session number.', 'hubspot-form-block' ), __( 'Visitor ID', 'hubspot-form-block' ) ],
		[ 'hubspotutk', 'statistics', $six_months, __( "Keeps track of a visitor's identity. Passed to HubSpot on form submission to deduplicate contacts.", 'hubspot-form-block' ), __( 'Visitor ID', 'hubspot-form-block' ) ],
		[ '__hssc', 'statistics', __( '30 minutes', 'hubspot-form-block' ), __( 'Tracks sessions.', 'hubspot-form-block' ), '' ],
		[ '__hssrc', 'statistics', __( 'Session', 'hubspot-form-block' ), __( 'Tells HubSpot whether the visitor has restarted their browser.', 'hubspot-form-block' ), '' ],
		[ 'messagesUtk', 'preferences', $six_months, __( "Recognises visitors who chat through HubSpot's chat tool.", 'hubspot-form-block' ), __( 'Visitor ID', 'hubspot-form-block' ) ],
		[ '__hs_do_not_track', 'functional', $six_months, __( 'Stops the HubSpot tracking code sending information to HubSpot.', 'hubspot-form-block' ), '' ],
	];

	foreach ( $cookies as $cookie ) {
		list( $name, $category, $expires, $function, $personal_data ) = $cookie;

		wp_add_cookie_info( $name, 'HubSpot', $category, $expires, $function, $personal_data );
	}
}

add_action( 'init', __NAMESPACE__ . '\\register_consent_api' );

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
