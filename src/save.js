import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * @param {Object} props
 * @param {Object} props.attributes
 * @return {Element} Element to render.
 */
export default function save() {
	const blockProps = useBlockProps.save();
	const { children, ...innerBlocksProps } =
		useInnerBlocksProps.save( blockProps );

	return (
		<div { ...innerBlocksProps }>
			{ children }
		</div>
	);
}
