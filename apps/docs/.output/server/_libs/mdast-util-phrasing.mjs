import { o as convert } from "./hast-util-raw+[...].mjs";
//#region node_modules/mdast-util-phrasing/lib/index.js
/**
* @typedef {import('mdast').Html} Html
* @typedef {import('mdast').PhrasingContent} PhrasingContent
*/
/**
* Check if the given value is *phrasing content*.
*
* > 👉 **Note**: Excludes `html`, which can be both phrasing or flow.
*
* @param node
*   Thing to check, typically `Node`.
* @returns
*   Whether `value` is phrasing content.
*/
var phrasing = convert([
	"break",
	"delete",
	"emphasis",
	"footnote",
	"footnoteReference",
	"image",
	"imageReference",
	"inlineCode",
	"inlineMath",
	"link",
	"linkReference",
	"mdxJsxTextElement",
	"mdxTextExpression",
	"strong",
	"text",
	"textDirective"
]);
//#endregion
export { phrasing as t };
