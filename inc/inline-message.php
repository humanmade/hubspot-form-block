<?php
/**
 * Server-side gated content: locating form block instances, rendering their
 * inner-block ("inline message") content on demand, and verifying that a
 * HubSpot submission actually happened before releasing that content.
 *
 * The inner-block content is never emitted into the page. It is fetched from
 * the REST endpoint registered here, which only returns it once a submission
 * has been verified (strong mode, when a private app token is configured) or
 * unconditionally (best-effort mode, no token).
 *
 * @package hubspot-form-block
 */

namespace HM\HubspotFormBlock;

/**
 * Resolve the HubSpot private app access token, if any.
 *
 * Read order: constant -> filter -> option (option intentionally NOT exposed
 * via the REST API). When this returns a non-empty string, the unlock endpoint
 * runs in "strong" mode and verifies submissions against HubSpot.
 *
 * @return string The token, or an empty string when none is configured.
 */
function get_private_token() : string {
	$token = '';

	if ( defined( 'HUBSPOT_FORMS_PRIVATE_TOKEN' ) && HUBSPOT_FORMS_PRIVATE_TOKEN ) {
		$token = (string) HUBSPOT_FORMS_PRIVATE_TOKEN;
	}

	/**
	 * Filter the HubSpot private app access token used to verify submissions.
	 *
	 * @param string $token The token resolved from the constant (may be empty).
	 */
	$token = (string) apply_filters( 'hubspot_form_block_private_token', $token );

	if ( '' === $token ) {
		$token = (string) get_option( 'hubspot_embed_private_app_token', '' );
	}

	return trim( $token );
}

/**
 * Whether a parsed hubspot/form block has real inline-message inner content.
 *
 * Mirrors the predicate render.php uses to decide whether to treat inner
 * blocks as a success message (ignoring an empty default paragraph).
 *
 * @param array $node Parsed block node.
 * @return bool
 */
function block_has_inline_message( array $node ) : bool {
	if ( ! empty( $node['attrs']['redirectUrl'] ) ) {
		return false;
	}
	if ( empty( $node['innerBlocks'] ) ) {
		return false;
	}
	$first = $node['innerBlocks'][0]['innerHTML'] ?? '';
	return trim( $first ) !== '<p></p>';
}

/**
 * Render the inline-message HTML for a set of inner blocks.
 *
 * Produces the same wrapper class render.php previously rewrote the saved
 * block wrapper to, so the existing frontend styles apply unchanged.
 *
 * @param array $inner_blocks Parsed inner block nodes.
 * @return string
 */
function get_inline_message_html( array $inner_blocks ) : string {
	$inner = '';
	foreach ( $inner_blocks as $child ) {
		$inner .= render_block( $child );
	}
	return '<div class="wp-block-hubspot-form__inline-message">' . $inner . '</div>';
}

/**
 * Collect every hubspot/form block in render (document, depth-first) order,
 * expanding synced patterns (core/block) the same way render_block() does.
 *
 * @param array $blocks    Parsed blocks.
 * @param array $collected Accumulator (passed by reference).
 */
function collect_form_blocks( array $blocks, array &$collected ) {
	foreach ( $blocks as $block ) {
		$name = $block['blockName'] ?? null;

		if ( 'hubspot/form' === $name ) {
			$collected[] = $block;
		} elseif ( 'core/block' === $name && ! empty( $block['attrs']['ref'] ) ) {
			$ref_post = get_post( (int) $block['attrs']['ref'] );
			if ( $ref_post && 'wp_block' === $ref_post->post_type ) {
				collect_form_blocks( parse_blocks( $ref_post->post_content ), $collected );
			}
		}

		if ( ! empty( $block['innerBlocks'] ) ) {
			collect_form_blocks( $block['innerBlocks'], $collected );
		}
	}
}

/**
 * Locate the Nth hubspot/form block with a given form ID within a post.
 *
 * The instance index is per-form-ID and matches render.php's global
 * $hubspot_form_block_instance_ids counter.
 *
 * @param int    $post_id  Post ID.
 * @param string $form_id  HubSpot form ID.
 * @param int    $instance 1-based per-form-ID instance index.
 * @return array|null The parsed block node, or null when not found.
 */
function locate_form_block( int $post_id, string $form_id, int $instance ) {
	$post = get_post( $post_id );
	if ( ! $post ) {
		return null;
	}

	$collected = [];
	collect_form_blocks( parse_blocks( $post->post_content ), $collected );

	$n = 0;
	foreach ( $collected as $node ) {
		if ( ( $node['attrs']['formId'] ?? '' ) !== $form_id ) {
			continue;
		}
		$n++;
		if ( $n === $instance ) {
			return $node;
		}
	}

	return null;
}

/**
 * Secret used to sign repeat-visit unlock tokens.
 *
 * @return string
 */
function unlock_token_secret() : string {
	return wp_salt( 'hsfb_unlock' );
}

/**
 * Mint a signed, expiring unlock token for a specific form instance.
 *
 * Returned to the client on first successful unlock and replayed on repeat
 * visits so persisted gated content can be re-served without another HubSpot
 * lookup.
 *
 * @param int    $post_id  Post ID.
 * @param string $form_id  HubSpot form ID.
 * @param int    $instance Instance index.
 * @return string
 */
function mint_unlock_token( int $post_id, string $form_id, int $instance ) : string {
	/**
	 * Filter the lifetime (in seconds) of a repeat-visit unlock token.
	 *
	 * @param int $ttl Token lifetime in seconds.
	 */
	$ttl    = (int) apply_filters( 'hubspot_form_block_unlock_token_ttl', MONTH_IN_SECONDS );
	$expiry = time() + $ttl;
	$payload = $post_id . '|' . $form_id . '|' . $instance . '|' . $expiry;
	$sig     = hash_hmac( 'sha256', $payload, unlock_token_secret() );

	return $expiry . '.' . $sig;
}

/**
 * Verify a repeat-visit unlock token.
 *
 * @param string $token    Token from the client.
 * @param int    $post_id  Post ID.
 * @param string $form_id  HubSpot form ID.
 * @param int    $instance Instance index.
 * @return bool
 */
function verify_unlock_token( string $token, int $post_id, string $form_id, int $instance ) : bool {
	if ( '' === $token || strpos( $token, '.' ) === false ) {
		return false;
	}

	$parts  = explode( '.', $token, 2 );
	$expiry = (int) $parts[0];
	$sig    = $parts[1];

	if ( $expiry < time() ) {
		return false;
	}

	$payload  = $post_id . '|' . $form_id . '|' . $instance . '|' . $expiry;
	$expected = hash_hmac( 'sha256', $payload, unlock_token_secret() );

	return hash_equals( $expected, $sig );
}

/**
 * Loosely compare two URLs by host + path (ignoring scheme, query and a
 * trailing slash). Used to confirm a HubSpot submission came from this page.
 *
 * @param string $a First URL.
 * @param string $b Second URL.
 * @return bool
 */
function urls_match( string $a, string $b ) : bool {
	$pa = wp_parse_url( $a );
	$pb = wp_parse_url( $b );
	if ( ! $pa || ! $pb ) {
		return false;
	}

	$host_a = strtolower( $pa['host'] ?? '' );
	$host_b = strtolower( $pb['host'] ?? '' );
	$path_a = untrailingslashit( $pa['path'] ?? '' );
	$path_b = untrailingslashit( $pb['path'] ?? '' );

	return $host_a === $host_b && $path_a === $path_b;
}

/**
 * Verify that a real, recent HubSpot submission exists for a form + page.
 *
 * Matching is heuristic: the HubSpot submissions API does not return the
 * client-side conversionId, so we require a recent submission whose pageUrl
 * matches this page and (when supplied) whose values contain the email. The
 * submissions list is cached briefly to avoid hammering the API while the
 * client polls.
 *
 * @param string $token    Private app access token.
 * @param string $form_id  HubSpot form ID.
 * @param string $email    Submitted email (may be empty).
 * @param string $page_url Permalink of the page the form is on.
 * @return bool True when a matching submission is found; false when not (yet).
 */
function verify_hubspot_submission( string $token, string $form_id, string $email, string $page_url ) : bool {
	$cache_key   = 'hsfb_subs_' . md5( $form_id );
	$submissions = get_transient( $cache_key );

	if ( false === $submissions ) {
		$response = wp_remote_get(
			'https://api.hubapi.com/form-integrations/v1/submissions/forms/' . rawurlencode( $form_id ) . '?limit=50',
			[
				'timeout' => 5,
				'headers' => [
					'Authorization' => 'Bearer ' . $token,
				],
			]
		);

		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			// Treat transient API failures as "not yet verified" so the client retries.
			return false;
		}

		$body        = json_decode( wp_remote_retrieve_body( $response ), true );
		$submissions = is_array( $body ) && isset( $body['results'] ) ? $body['results'] : [];

		/**
		 * Filter how long (seconds) the submissions list is cached per form.
		 *
		 * @param int $ttl Cache lifetime.
		 */
		$ttl = (int) apply_filters( 'hubspot_form_block_submissions_cache_ttl', 30 );
		set_transient( $cache_key, $submissions, $ttl );
	}

	/**
	 * Filter the recency window (seconds) within which a submission must have
	 * occurred to be accepted as proof for a fresh unlock.
	 *
	 * @param int $window Window in seconds.
	 */
	$window_ms = (int) apply_filters( 'hubspot_form_block_submission_window', 5 * MINUTE_IN_SECONDS ) * 1000;
	$now_ms    = time() * 1000;
	$email     = strtolower( $email );

	foreach ( (array) $submissions as $sub ) {
		$submitted_at = isset( $sub['submittedAt'] ) ? (int) $sub['submittedAt'] : 0;
		if ( $submitted_at && $submitted_at < $now_ms - $window_ms ) {
			continue;
		}

		if ( ! empty( $sub['pageUrl'] ) && ! urls_match( $sub['pageUrl'], $page_url ) ) {
			continue;
		}

		if ( '' !== $email ) {
			$email_matched = false;
			foreach ( (array) ( $sub['values'] ?? [] ) as $value ) {
				if ( strtolower( (string) ( $value['value'] ?? '' ) ) === $email ) {
					$email_matched = true;
					break;
				}
			}
			if ( ! $email_matched ) {
				continue;
			}
		}

		return true;
	}

	return false;
}

/**
 * Simple per-IP rate limiter for the unlock endpoint.
 *
 * @return bool True when the current request should be rejected.
 */
function unlock_is_rate_limited() : bool {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	if ( '' === $ip ) {
		return false;
	}

	/**
	 * Filter the maximum number of unlock requests allowed per IP per minute.
	 *
	 * @param int $max Maximum requests.
	 */
	$max   = (int) apply_filters( 'hubspot_form_block_unlock_rate_limit', 30 );
	$key   = 'hsfb_rl_' . md5( $ip );
	$count = (int) get_transient( $key );

	if ( $count >= $max ) {
		return true;
	}

	set_transient( $key, $count + 1, MINUTE_IN_SECONDS );
	return false;
}

/**
 * Build the success response for an unlocked form instance.
 *
 * @param array  $node     Parsed form block node.
 * @param int    $post_id  Post ID.
 * @param string $form_id  HubSpot form ID.
 * @param int    $instance Instance index.
 * @return \WP_REST_Response
 */
function unlock_success_response( array $node, int $post_id, string $form_id, int $instance ) : \WP_REST_Response {
	// Render with the post as the global context so context-dependent blocks
	// (e.g. core/embed oEmbed caching) resolve the same way they do on the page.
	global $post;
	$previous = $post;
	$post     = get_post( $post_id ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
	setup_postdata( $post );

	$html = get_inline_message_html( $node['innerBlocks'] );

	$post = $previous; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
	wp_reset_postdata();

	return new \WP_REST_Response(
		[
			'html'        => $html,
			'unlockToken' => mint_unlock_token( $post_id, $form_id, $instance ),
		],
		200
	);
}

/**
 * Register the unlock REST route.
 */
function register_unlock_route() {
	register_rest_route(
		'hubspot-form-block/v1',
		'/unlock',
		[
			'methods'             => 'POST',
			'callback'            => __NAMESPACE__ . '\\rest_unlock',
			'permission_callback' => '__return_true',
			'args'                => [
				'postId'      => [
					'type'     => 'integer',
					'required' => true,
				],
				'formId'      => [
					'type'     => 'string',
					'required' => true,
				],
				'instance'    => [ 'type' => 'integer' ],
				'email'       => [ 'type' => 'string' ],
				'unlockToken' => [ 'type' => 'string' ],
			],
		]
	);
}

add_action( 'rest_api_init', __NAMESPACE__ . '\\register_unlock_route' );

/**
 * Handle a POST to the unlock endpoint.
 *
 * @param \WP_REST_Request $request Request.
 * @return \WP_REST_Response
 */
function rest_unlock( \WP_REST_Request $request ) : \WP_REST_Response {
	if ( unlock_is_rate_limited() ) {
		return new \WP_REST_Response( [ 'status' => 'rate_limited' ], 429 );
	}

	$post_id      = absint( $request['postId'] );
	$form_id      = sanitize_text_field( (string) $request['formId'] );
	$instance     = max( 1, absint( $request['instance'] ) );
	$email        = sanitize_email( (string) $request['email'] );
	$unlock_token = is_string( $request['unlockToken'] ) ? $request['unlockToken'] : '';

	if ( ! $post_id || '' === $form_id ) {
		return new \WP_REST_Response( [ 'status' => 'invalid' ], 400 );
	}

	if ( 'publish' !== get_post_status( $post_id ) || ! is_post_publicly_viewable( $post_id ) ) {
		return new \WP_REST_Response( [ 'status' => 'forbidden' ], 403 );
	}

	$node = locate_form_block( $post_id, $form_id, $instance );
	if ( ! $node ) {
		return new \WP_REST_Response( [ 'status' => 'not_found' ], 404 );
	}

	// Re-derive the form ID from the located block; never trust the client for content selection.
	$form_id = (string) ( $node['attrs']['formId'] ?? $form_id );

	if ( ! block_has_inline_message( $node ) ) {
		return new \WP_REST_Response( null, 204 );
	}

	// Repeat-visit token path: a valid token alone unlocks (no HubSpot call).
	if ( '' !== $unlock_token && verify_unlock_token( $unlock_token, $post_id, $form_id, $instance ) ) {
		return unlock_success_response( $node, $post_id, $form_id, $instance );
	}

	$token = get_private_token();
	if ( '' !== $token ) {
		// Strong mode: require a verified HubSpot submission.
		if ( ! verify_hubspot_submission( $token, $form_id, $email, (string) get_permalink( $post_id ) ) ) {
			return new \WP_REST_Response( [ 'status' => 'pending' ], 202 );
		}
		return unlock_success_response( $node, $post_id, $form_id, $instance );
	}

	// Best-effort mode: no token configured, return content directly.
	return unlock_success_response( $node, $post_id, $form_id, $instance );
}
