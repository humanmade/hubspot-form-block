const { request } = require( '@playwright/test' );

const STORAGE_STATE = 'test-results/.auth/admin.json';

/**
 * Logs in as the Playground admin once and saves the session, so every test
 * starts authenticated instead of relying on Playground's auto-login at the
 * first request of each browser context.
 *
 * @param {Object} config The resolved Playwright config.
 */
async function globalSetup( config ) {
	const { baseURL } = config.projects[ 0 ].use;
	const context = await request.newContext( { baseURL } );

	await context.get( '/wp-login.php' );
	const response = await context.post( '/wp-login.php', {
		form: {
			log: process.env.WP_USERNAME || 'admin',
			pwd: process.env.WP_PASSWORD || 'password',
			'wp-submit': 'Log In',
			redirect_to: '/wp-admin/',
		},
		headers: { Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
		maxRedirects: 0,
	} );

	if ( response.status() !== 302 ) {
		throw new Error( `Admin login failed with status ${ response.status() }` );
	}

	await context.storageState( { path: STORAGE_STATE } );
	await context.dispose();
}

module.exports = globalSetup;
