import { Children, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { InspectorControls, useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { Button, PanelBody, SelectControl, TextControl } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import './editor.scss';

/**
 * The edit function describes the structure of your block in the context of the
 * editor. This represents what the editor will render when the block is used.
 *
 * @see https://developer.wordpress.org/block-editor/reference-guides/block-api/block-edit-save/#edit
 *
 * @return {WPElement} Element to render.
 */
export default function Edit( { attributes, setAttributes } ) {
	const { ...blockProps } = useBlockProps();
	const { children, ...innerBlocksProps } = useInnerBlocksProps( blockProps, {
		template: [ [ 'core/paragraph', { placeholder: __( 'Optional inline response message...', 'hubspot-from-block' ) } ] ],
	} );

	const {
		portalId,
		region,
		formId,
		redirectUrl,
		submitText,
		goToWebinarWebinarKey,
		sfdcCampaignId,
		gtmEventName,
	} = attributes;

	const [ isGlobalChanged, setIsGlobalChanged ] = useState( false );

	const {
		canSetPortalId,
		defaultPortalId = '',
		defaultRegion,
	} = useSelect( ( select ) => {
		const settings = select( 'core' ).getSite();

		return {
			canSetPortalId: select( 'core' ).canUser( 'update', 'settings' ),
			defaultPortalId: settings?.hubspot_embed_portal_id || '',
			defaultRegion: settings?.hubspot_embed_region || 'eu1',
		};
	}, [ isGlobalChanged ] );

	const { saveSite } = useDispatch( 'core' );
	const updateDefaults = ( newPortalId, newRegion ) => saveSite( {
		hubspot_embed_portal_id: newPortalId,
		hubspot_embed_region: newRegion,
	} );

	return (
		<div {...innerBlocksProps}>
			<InspectorControls >
				<PanelBody title={ __( 'Global Settings', 'hubspot-form-block' ) } initialOpen={ ! defaultPortalId && ! portalId }>
					<TextControl
						label={ __( 'Portal ID', 'hubspot-form-block' ) }
						value={ portalId }
						placeholder={ defaultPortalId }
						onChange={ ( portalId ) => {
							setAttributes( { portalId } );
							setIsGlobalChanged( true );
						} }
						required={ ! defaultPortalId }
					/>
					<SelectControl
						label={ __( 'Region', 'hubspot-form-block' ) }
						options={ [
							{ label: __( 'Europe', 'hubspot-form-block' ), value: 'eu1' },
							{ label: __( 'North America', 'hubspot-form-block' ), value: 'na1' },
						] }
						value={ region }
						defaultValue={ defaultRegion }
						onChange={ ( region ) => {
							setAttributes( { region } );
							setIsGlobalChanged( true );
						} }
					/>
					{ canSetPortalId && isGlobalChanged && (
						<Button
							variant="secondary"
							onClick={ () => {
								setAttributes( { portalId: '' } );
								updateDefaults( portalId, region );
								setIsGlobalChanged( false );
							} }
						>
							{ __( 'Set as global defaults', 'hubspot-form-block' ) }
						</Button>
					) }
				</PanelBody>
				<PanelBody title={ __( 'Form Settings', 'hubspot-form-block' ) }>
					<TextControl
						label={ __( 'Form ID', 'hubspot-form-block' ) }
						value={ formId }
						onChange={ ( formId ) => setAttributes( { formId } ) }
						required
					/>
					<TextControl
						label={ __( 'Redirect URL', 'hubspot-form-block' ) }
						type="url"
						value={ redirectUrl }
						onChange={ ( redirectUrl ) => setAttributes( { redirectUrl } ) }
					/>
					<TextControl
						label={ __( 'Submit button text', 'hubspot-form-block' ) }
						value={ submitText }
						onChange={ ( submitText ) => setAttributes( { submitText } ) }
					/>
					<TextControl
						label={ __( 'SalesForce campaign key', 'hubspot-form-block' ) }
						value={ sfdcCampaignId }
						onChange={ ( sfdcCampaignId ) => setAttributes( { sfdcCampaignId } ) }
					/>
					<TextControl
						label={ __( 'GoToWebinar webinar key', 'hubspot-form-block' ) }
						value={ goToWebinarWebinarKey }
						onChange={ ( goToWebinarWebinarKey ) => setAttributes( { goToWebinarWebinarKey } ) }
					/>
					<TextControl
						label={ __( 'Google Tag Manager event name', 'hubspot-form-block' ) }
						value={ gtmEventName }
						onChange={ ( gtmEventName ) => setAttributes( { gtmEventName } ) }
					/>
				</PanelBody>
			</InspectorControls>
			<h3>
				<svg style={{ width: '1em', height: '1em', marginRight: '12px' }} height="2500" viewBox="6.20856283 .64498824 244.26943717 251.24701176" width="2500" xmlns="http://www.w3.org/2000/svg"><path d="m191.385 85.694v-29.506a22.722 22.722 0 0 0 13.101-20.48v-.677c0-12.549-10.173-22.722-22.721-22.722h-.678c-12.549 0-22.722 10.173-22.722 22.722v.677a22.722 22.722 0 0 0 13.101 20.48v29.506a64.342 64.342 0 0 0 -30.594 13.47l-80.922-63.03c.577-2.083.878-4.225.912-6.375a25.6 25.6 0 1 0 -25.633 25.55 25.323 25.323 0 0 0 12.607-3.43l79.685 62.007c-14.65 22.131-14.258 50.974.987 72.7l-24.236 24.243c-1.96-.626-4-.959-6.057-.987-11.607.01-21.01 9.423-21.007 21.03.003 11.606 9.412 21.014 21.018 21.017 11.607.003 21.02-9.4 21.03-21.007a20.747 20.747 0 0 0 -.988-6.056l23.976-23.985c21.423 16.492 50.846 17.913 73.759 3.562 22.912-14.352 34.475-41.446 28.985-67.918-5.49-26.473-26.873-46.734-53.603-50.792m-9.938 97.044a33.17 33.17 0 1 1 0-66.316c17.85.625 32 15.272 32.01 33.134.008 17.86-14.127 32.522-31.977 33.165" fill="#ff7a59"/></svg>
				{ __( 'Hubspot Form', 'hubspot-form-block' ) }
			</h3>
			{ ( ! defaultPortalId || ! formId ) && (
				<p>{ __( 'Please enter a Portal ID and a Form ID in the sidebar block controls.', 'hubspot-form-block' ) }</p>
			) }
			{ defaultPortalId && formId && (
				<p>{ __( 'Please preview your changes to see the form, it cannot be shown in the editor directly.', 'hubspot-form-block' ) }</p>
			) }
			<hr />
			<div className="wp-hubspot-form-block__inline-message">
				{ children }
			</div>
		</div>
	);
}
