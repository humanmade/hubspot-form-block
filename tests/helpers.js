/**
 * Returns a locator scoped to the block editor canvas iframe, which
 * WordPress uses to isolate block content from the surrounding admin UI.
 *
 * @param {import('@playwright/test').Page} page
 * @return {import('@playwright/test').FrameLocator} Editor canvas frame.
 */
function editorCanvas( page ) {
	return page.locator( 'iframe[name="editor-canvas"]' ).contentFrame();
}

module.exports = { editorCanvas };
