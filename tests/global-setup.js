/* global globalThis */
const path = require( 'path' );
const fs = require( 'fs' );
const { runCLI } = require( '@wp-playground/cli' );

const PLUGIN_DIR = path.resolve( __dirname, '..' );
const PORT = Number( process.env.WP_PORT || 9400 );

/**
 * Boots a WordPress Playground server for the whole test run and stashes the
 * handle so global teardown can dispose it.
 *
 * This mirrors the old `npm run playground:start` command (same blueprint,
 * same auto-mounted-and-activated plugin) but runs it programmatically via
 * the Playground CLI's `runCLI` API, so the test run owns the server
 * lifecycle. That removes the brittle "spawn the server, poll a URL, hope
 * it's ready" dance the CI workflow used to do.
 *
 * @see https://wordpress.github.io/wordpress-playground/guides/e2e-testing-with-playwright
 */
module.exports = async () => {
	const blueprint = JSON.parse(
		fs.readFileSync( path.join( PLUGIN_DIR, 'blueprint.json' ), 'utf8' )
	);

	const server = await runCLI( {
		command: 'server',
		port: PORT,
		blueprint,
		// Auto-detect this plugin, mount it into wp-content/plugins and
		// activate it — the programmatic equivalent of the `--auto-mount` flag.
		autoMount: PLUGIN_DIR,
		// Let the CI matrix pin PHP/WordPress versions; without these the
		// blueprint's preferredVersions apply.
		...( process.env.PLAYGROUND_PHP
			? { php: process.env.PLAYGROUND_PHP }
			: {} ),
		...( process.env.PLAYGROUND_WP
			? { wp: process.env.PLAYGROUND_WP }
			: {} ),
	} );

	// Hand the running server to global teardown (same Node process).
	globalThis.__PLAYGROUND_SERVER__ = server;
};
