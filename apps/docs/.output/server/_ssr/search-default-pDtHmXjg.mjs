import { i as __toESM } from "../_runtime.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { c as useI18n, l as useOnChange } from "./use-on-change-BlU-csFW.mjs";
import { a as SearchDialogHeader, c as SearchDialogList, d as TagsListItem, f as useDocsSearch, i as SearchDialogFooter, l as SearchDialogOverlay, n as SearchDialogClose, o as SearchDialogIcon, r as SearchDialogContent, s as SearchDialogInput, t as SearchDialog, u as TagsList } from "./client-BboDFG0M.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/search-default-pDtHmXjg.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
function DefaultSearchDialog({ defaultTag, tags = [], api, delayMs, type = "fetch", allowClear = false, links = [], footer, ...props }) {
	const { locale } = useI18n();
	const [tag, setTag] = (0, import_react.useState)(defaultTag);
	const { search, setSearch, query } = useDocsSearch(type === "fetch" ? {
		type: "fetch",
		api,
		locale,
		tag,
		delayMs
	} : {
		type: "static",
		from: api,
		locale,
		tag,
		delayMs
	});
	const defaultItems = (0, import_react.useMemo)(() => {
		if (links.length === 0) return null;
		return links.map(([name, link]) => ({
			type: "page",
			id: name,
			content: name,
			url: link
		}));
	}, [links]);
	useOnChange(defaultTag, (v) => {
		setTag(v);
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SearchDialog, {
		search,
		onSearchChange: setSearch,
		isLoading: query.isLoading,
		...props,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogOverlay, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SearchDialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SearchDialogHeader, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogIcon, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogInput, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogClose, {})
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogList, { items: query.data !== "empty" ? query.data : defaultItems })] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SearchDialogFooter, { children: [tags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagsList, {
				tag,
				onTagChange: setTag,
				allowClear,
				children: tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagsListItem, {
					value: tag.value,
					children: tag.name
				}, tag.value))
			}), footer] })
		]
	});
}
//#endregion
export { DefaultSearchDialog as default };
