import { i as __toESM } from "./_runtime.mjs";
import { d as Link } from "./_libs/@tanstack/react-router+[...].mjs";
import { o as require_jsx_runtime } from "./_libs/@radix-ui/react-arrow+[...].mjs";
import { o as visit } from "./_ssr/staticFunctionMiddleware-DKfZ4dwE.mjs";
import { u as require_react } from "./_libs/@floating-ui/react-dom+[...].mjs";
import { c as clientLoader, i as Route, o as baseOptions, t as DocsLayout } from "./_-Wc-HzvQu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/_-C_FDAJqY.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
function deserializePageTree(serialized) {
	const root = serialized.data;
	visit(root, (item) => {
		if ("icon" in item && typeof item.icon === "string") item.icon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { dangerouslySetInnerHTML: { __html: item.icon } });
		if (typeof item.name === "string") item.name = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "fd-page-tree-item-name",
			dangerouslySetInnerHTML: { __html: item.name }
		});
	});
	return root;
}
/**
* Deserialize loader data that is serialized by the server-side Fumadocs `loader()`, supported:
* - Page Tree
*
* other unrelated properties are kept in the output.
*/
function useFumadocsLoader(serialized) {
	return (0, import_react.useMemo)(() => {
		const out = {};
		for (const k in serialized) {
			const v = serialized[k];
			if (isSerializedPageTree(v)) out[k] = deserializePageTree(v);
			else out[k] = v;
		}
		return out;
	}, [serialized]);
}
function isSerializedPageTree(v) {
	return typeof v === "object" && v !== null && "$fumadocs_loader" in v && v.$fumadocs_loader === "page-tree";
}
function Page() {
	const { pageTree, path, markdownUrl } = useFumadocsLoader(Route.useLoaderData());
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DocsLayout, {
		...baseOptions(),
		tree: pageTree,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: markdownUrl,
			hidden: true
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, { children: clientLoader.useContent(path, {
			markdownUrl,
			path
		}) })]
	});
}
//#endregion
export { Page as component };
