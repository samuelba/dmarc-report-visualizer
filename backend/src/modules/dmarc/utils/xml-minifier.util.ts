// Use require here because the TypeScript types don't include the minify function
// eslint-disable-next-line @typescript-eslint/no-var-requires
const xmlFormatter = require('xml-formatter');

/**
 * Minifies XML content by removing unnecessary whitespace and formatting.
 * This reduces storage size while preserving the XML structure and content.
 *
 * @param xml - The XML string to minify
 * @returns The minified XML string, or the original string if minification fails
 */
export function minifyXml(xml: string): string {
  if (!xml || typeof xml !== 'string') {
    return xml;
  }

  try {
    // Use xml-formatter's built-in minify function
    return xmlFormatter.minify(xml, {
      collapseContent: true,
    });
  } catch (_error) {
    // If minification fails, return the original XML
    // This ensures we don't lose data even if the XML is malformed
    return xml;
  }
}
