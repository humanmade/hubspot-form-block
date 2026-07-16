/**
 * @type {import('@playwright/test').PlaywrightTestConfig}
 */
const config = {
	testDir: './tests',
	// The WordPress Playground server is started/stopped programmatically for
	// the whole run (see tests/global-setup.js) instead of via a webServer
	// command — no independent server process to start and poll in CI.
	globalSetup: require.resolve( './tests/global-setup.js' ),
	globalTeardown: require.resolve( './tests/global-teardown.js' ),
	fullyParallel: true,
	forbidOnly: !! process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [
		[ 'html', { open: process.env.CI ? 'never' : 'on-failure' } ],
		[ 'json', { outputFile: 'test-results/results.json' } ],
		[ 'list' ],
	],
	use: {
		baseURL:
			process.env.WP_BASE_URL ||
			`http://127.0.0.1:${ process.env.WP_PORT || 9400 }`,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' },
		},
	],
};

module.exports = config;
