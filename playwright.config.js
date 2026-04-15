/**
 * @type {import('@playwright/test').PlaywrightTestConfig}
 */
const config = {
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !! process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : 2,
	reporter: [
		[ 'html', { open: process.env.CI ? 'never' : 'on-failure' } ],
		[ 'json', { outputFile: 'test-results/results.json' } ],
		[ 'list' ],
	],
	use: {
		baseURL: process.env.WP_BASE_URL || 'http://127.0.0.1:9400',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' },
		},
	],
	webServer: process.env.CI
		? undefined
		: {
				command: `cd ${ __dirname } && npm run playground:start`,
				url: 'http://127.0.0.1:9400/wp-admin/',
				reuseExistingServer: true,
				timeout: 120000,
		  },
};

module.exports = config;
