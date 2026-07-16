/* global globalThis */

/**
 * Disposes the WordPress Playground server started in global setup, shutting
 * down its worker threads so the test process can exit cleanly.
 */
module.exports = async () => {
	const server = globalThis.__PLAYGROUND_SERVER__;
	if ( server ) {
		await server[ Symbol.asyncDispose ]();
		globalThis.__PLAYGROUND_SERVER__ = undefined;
	}
};
