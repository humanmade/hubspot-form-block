/**
 * @type {import('@playwright/test').PlaywrightTestConfig}
 */
const config = {
	testDir: './tests',
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
				command: `npm run playground:start`,
				url: process.env.WP_BASE_URL || 'http://127.0.0.1:9400',
				wait: {
					stdout: /Ready\!/,
				},
				stdout: 'pipe',
				reuseExistingServer: true,
				timeout: 60000,
		  },
};

module.exports = config;
