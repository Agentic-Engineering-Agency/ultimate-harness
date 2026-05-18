import { i as __toESM } from "../_runtime.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { a as Search, p as Hash, x as ChevronRight } from "../_libs/lucide-react.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { c as useI18n, d as useRouter, l as useOnChange, n as I18nLabel, o as buttonVariants } from "./use-on-change-BlU-csFW.mjs";
import { t as e } from "../_libs/scroll-into-view-if-needed.mjs";
import { i as DialogTitle, n as DialogContent, r as DialogOverlay, t as Dialog } from "../_libs/@radix-ui/react-dialog+[...].mjs";
import { t as toJsxRuntime } from "../_libs/hast-util-to-jsx-runtime+[...].mjs";
import { n as VFile, t as remark } from "../_libs/remark+[...].mjs";
import { a as visit } from "../_libs/hast-util-raw+[...].mjs";
import { t as remarkRehype } from "../_libs/remark-rehype.mjs";
import { t as rehypeRaw } from "../_libs/rehype-raw.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/client-BboDFG0M.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
function createMarkdownRenderer({ rehypePlugins = [], remarkPlugins = [], remarkRehypeOptions } = {}) {
	const processor = remark().use(remarkPlugins).use(remarkRehype, remarkRehypeOptions).use(rehypePlugins);
	const promises = {};
	function render(tree, file, props) {
		return toJsxRuntime(tree, {
			development: false,
			filePath: file.path,
			components: props.components,
			...import_jsx_runtime
		});
	}
	function parse(file) {
		return processor.parse(file);
	}
	return {
		Markdown(props) {
			const { async = false, children } = props;
			const file = new VFile(children);
			const id = `${file.path}:${file.value}`;
			if (async) {
				promises[id] ??= processor.run(parse(file), file);
				return render((0, import_react.use)(promises[id]), file, props);
			}
			return render((0, import_react.useMemo)(() => processor.runSync(parse(file), file), [id]), file, props);
		},
		async MarkdownServer(props) {
			const file = new VFile(props.children);
			return render(await processor.run(parse(file), file), file, props);
		}
	};
}
var RootContext = (0, import_react.createContext)(null);
var ListContext = (0, import_react.createContext)(null);
var TagsListContext = (0, import_react.createContext)(null);
var PreContext = (0, import_react.createContext)(false);
var mdRenderer = createMarkdownRenderer({
	remarkRehypeOptions: { allowDangerousHtml: true },
	rehypePlugins: [rehypeRaw, rehypeCustomElements]
});
var mdComponents = {
	mark(props) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			...props,
			className: "text-fd-primary underline"
		});
	},
	a: "span",
	p(props) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			...props,
			className: "min-w-0"
		});
	},
	strong(props) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
			...props,
			className: "text-fd-accent-foreground font-medium"
		});
	},
	code(props) {
		if ((0, import_react.use)(PreContext)) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
			...props,
			className: "mask-[linear-gradient(to_bottom,white,white_30px,transparent_80px)]"
		});
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
			...props,
			className: "border rounded-md px-px bg-fd-secondary text-fd-secondary-foreground"
		});
	},
	custom({ _tagName = "fragment", children, ...rest }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "inline-flex max-w-full items-center border p-0.5 rounded-md bg-fd-card text-fd-card-foreground divide-x divide-fd-border",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
					className: "rounded-sm px-0.5 me-1 bg-fd-primary font-medium text-xs text-fd-primary-foreground border-none",
					children: _tagName
				}),
				Object.entries(rest).map(([k, v]) => {
					if (typeof v !== "string") return;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("code", {
						className: "truncate text-xs text-fd-muted-foreground px-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-fd-card-foreground",
							children: [k, ": "]
						}), v]
					}, k);
				}),
				children && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "ps-1",
					children
				})
			]
		});
	},
	pre(props) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
			...props,
			className: twMerge("flex flex-col border rounded-md my-0.5 p-2 bg-fd-secondary text-fd-secondary-foreground max-h-20 overflow-hidden", props.className),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreContext, {
				value: true,
				children: props.children
			})
		});
	}
};
function rehypeCustomElements() {
	return (tree) => {
		visit(tree, (node) => {
			if (node.type === "element" && document.createElement(node.tagName) instanceof HTMLUnknownElement) {
				node.properties._tagName = node.tagName;
				node.tagName = "custom";
			}
		});
	};
}
function SearchDialog({ open, onOpenChange, search, onSearchChange, isLoading = false, onSelect: onSelectProp, children }) {
	const router = useRouter();
	const onOpenChangeCallback = (0, import_react.useRef)(onOpenChange);
	onOpenChangeCallback.current = onOpenChange;
	const onSearchChangeCallback = (0, import_react.useRef)(onSearchChange);
	onSearchChangeCallback.current = onSearchChange;
	const onSelect = (item) => {
		if (item.type === "action") item.onSelect();
		else if (item.external) window.open(item.url, "_blank")?.focus();
		else router.push(item.url);
		onOpenChange(false);
		onSelectProp?.(item);
	};
	const onSelectCallback = (0, import_react.useRef)(onSelect);
	onSelectCallback.current = onSelect;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RootContext, {
			value: (0, import_react.useMemo)(() => ({
				open,
				search,
				isLoading,
				onOpenChange: (v) => onOpenChangeCallback.current(v),
				onSearchChange: (v) => onSearchChangeCallback.current(v),
				onSelect: (v) => onSelectCallback.current(v)
			}), [
				isLoading,
				open,
				search
			]),
			children
		})
	});
}
function SearchDialogHeader(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		className: twMerge("flex flex-row items-center gap-2 p-3", props.className)
	});
}
function SearchDialogInput(props) {
	const { text } = useI18n();
	const { search, onSearchChange } = useSearch();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		...props,
		value: search,
		onChange: (e) => onSearchChange(e.target.value),
		placeholder: text.search,
		className: "w-0 flex-1 bg-transparent text-lg placeholder:text-fd-muted-foreground focus-visible:outline-none"
	});
}
function SearchDialogClose({ children = "ESC", className, ...props }) {
	const { onOpenChange } = useSearch();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick: () => onOpenChange(false),
		className: twMerge(buttonVariants({
			color: "outline",
			size: "sm",
			className: "font-mono text-fd-muted-foreground"
		}), className),
		...props,
		children
	});
}
function SearchDialogFooter(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		className: twMerge("bg-fd-secondary/50 p-3 empty:hidden", props.className)
	});
}
function SearchDialogOverlay(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, {
		...props,
		className: twMerge("fixed inset-0 z-50 backdrop-blur-xs bg-fd-overlay data-[state=open]:animate-fd-fade-in data-[state=closed]:animate-fd-fade-out", props.className)
	});
}
function SearchDialogContent({ children, ...props }) {
	const { text } = useI18n();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
		"aria-describedby": void 0,
		...props,
		className: twMerge("fixed left-1/2 top-4 md:top-[calc(50%-250px)] z-50 w-[calc(100%-1rem)] max-w-screen-sm -translate-x-1/2 rounded-xl border bg-fd-popover text-fd-popover-foreground shadow-2xl shadow-black/50 overflow-hidden data-[state=closed]:animate-fd-dialog-out data-[state=open]:animate-fd-dialog-in", "*:border-b *:has-[+:last-child[data-empty=true]]:border-b-0 *:data-[empty=true]:border-b-0 *:last:border-b-0", props.className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, {
			className: "hidden",
			children: text.search
		}), children]
	});
}
function SearchDialogList({ items = null, Empty = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: "py-12 text-center text-sm text-fd-muted-foreground",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(I18nLabel, { label: "searchNoResult" })
}), Item = (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogListItem, { ...props }), ...props }) {
	const ref = (0, import_react.useRef)(null);
	const { onSelect } = useSearch();
	const [active, setActive] = (0, import_react.useState)(() => items && items.length > 0 ? items[0].id : null);
	const onKey = (0, import_react.useEffectEvent)((e) => {
		if (!items || e.isComposing) return;
		if (e.key === "ArrowDown" || e.key == "ArrowUp") {
			let idx = items.findIndex((item) => item.id === active);
			if (idx === -1) idx = 0;
			else if (e.key === "ArrowDown") idx++;
			else idx--;
			setActive(items.at(idx % items.length)?.id ?? null);
			e.preventDefault();
		}
		if (e.key === "Enter") {
			const selected = items.find((item) => item.id === active);
			if (selected) onSelect(selected);
			e.preventDefault();
		}
	});
	(0, import_react.useEffect)(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(() => {
			const viewport = element.firstElementChild;
			element.style.setProperty("--fd-animated-height", `${viewport.clientHeight}px`);
		});
		const viewport = element.firstElementChild;
		if (viewport) observer.observe(viewport);
		window.addEventListener("keydown", onKey);
		return () => {
			observer.disconnect();
			window.removeEventListener("keydown", onKey);
		};
	}, []);
	useOnChange(items, () => {
		if (items && items.length > 0) setActive(items[0].id);
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		ref,
		"data-empty": items === null,
		className: twMerge("overflow-hidden h-(--fd-animated-height) transition-[height]", props.className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: twMerge("w-full flex flex-col overflow-y-auto max-h-[460px] p-1", !items && "hidden"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ListContext, {
				value: (0, import_react.useMemo)(() => ({
					active,
					setActive
				}), [active]),
				children: [items?.length === 0 && Empty(), items?.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: Item({
					item,
					onClick: () => onSelect(item)
				}) }, item.id))]
			})
		})
	});
}
function SearchDialogListItem({ item, className, children, renderMarkdown = (s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(mdRenderer.Markdown, {
	components: mdComponents,
	children: s
}), renderHighlights: _, ...props }) {
	const { active: activeId, setActive } = useSearchList();
	const active = item.id === activeId;
	if (item.type === "action") children ??= item.node;
	else children ??= /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "inline-flex items-center text-fd-muted-foreground text-xs empty:hidden",
			children: item.breadcrumbs?.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [i > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "size-4 rtl:rotate-180" }), item] }, i))
		}),
		item.type !== "page" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			role: "none",
			className: "absolute inset-s-3 inset-y-0 w-px bg-fd-border"
		}),
		item.type === "heading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hash, { className: "absolute inset-s-6 top-2.5 size-4 text-fd-muted-foreground" }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: twMerge("min-w-0", item.type === "text" && "ps-4", item.type === "heading" && "ps-8", item.type === "page" || item.type === "heading" ? "font-medium" : "text-fd-popover-foreground/80"),
			children: typeof item.content === "string" ? renderMarkdown(item.content) : item.content
		})
	] });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		ref: (0, import_react.useCallback)((element) => {
			if (active && element) e(element, {
				scrollMode: "if-needed",
				block: "nearest",
				boundary: element.parentElement
			});
		}, [active]),
		"aria-selected": active,
		className: twMerge("relative select-none shrink-0 px-2.5 py-2 text-start text-sm overflow-hidden rounded-lg", active && "bg-fd-accent text-fd-accent-foreground", className),
		onPointerMove: () => setActive(item.id),
		...props,
		children
	});
}
function SearchDialogIcon(props) {
	const { isLoading } = useSearch();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
		...props,
		className: twMerge("size-5 text-fd-muted-foreground", isLoading && "animate-pulse duration-400", props.className)
	});
}
var itemVariants = cva("rounded-md border px-2 py-0.5 text-xs font-medium text-fd-muted-foreground transition-colors", { variants: { active: { true: "bg-fd-accent text-fd-accent-foreground" } } });
function TagsList({ tag, onTagChange, allowClear = false, ...props }) {
	const onTagChangeCallback = (0, import_react.useRef)(onTagChange);
	onTagChangeCallback.current = onTagChange;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		className: twMerge("flex items-center gap-1 flex-wrap", props.className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagsListContext, {
			value: (0, import_react.useMemo)(() => ({
				value: tag,
				onValueChange: (v) => onTagChangeCallback.current(v),
				allowClear
			}), [allowClear, tag]),
			children: props.children
		})
	});
}
function TagsListItem({ value, className, ...props }) {
	const { onValueChange, value: selectedValue, allowClear } = useTagsList();
	const selected = value === selectedValue;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		"data-active": selected,
		className: twMerge(itemVariants({
			active: selected,
			className
		})),
		onClick: () => onValueChange(selected && allowClear ? void 0 : value),
		tabIndex: -1,
		...props,
		children: props.children
	});
}
function useSearch() {
	const ctx = (0, import_react.use)(RootContext);
	if (!ctx) throw new Error("Missing <SearchDialog />");
	return ctx;
}
function useTagsList() {
	const ctx = (0, import_react.use)(TagsListContext);
	if (!ctx) throw new Error("Missing <TagsList />");
	return ctx;
}
function useSearchList() {
	const ctx = (0, import_react.use)(ListContext);
	if (!ctx) throw new Error("Missing <SearchDialogList />");
	return ctx;
}
function useDebounce(value, delayMs = 1e3) {
	const [debouncedValue, setDebouncedValue] = (0, import_react.useState)(value);
	(0, import_react.useEffect)(() => {
		if (delayMs === 0) return;
		const handler = window.setTimeout(() => {
			setDebouncedValue(value);
		}, delayMs);
		return () => clearTimeout(handler);
	}, [delayMs, value]);
	if (delayMs === 0) return value;
	return debouncedValue;
}
var promiseMap = {};
/**
* Provide a hook to query different official search clients.
*
* Note: it will re-query when its parameters changed, make sure to define `deps` array if you encounter rendering issues.
*/
function useDocsSearch(clientOptions, deps) {
	const { delayMs = 100, allowEmpty = false, ...clientRest } = clientOptions;
	const [search, setSearch] = (0, import_react.useState)("");
	const [results, setResults] = (0, import_react.useState)("empty");
	const [error, setError] = (0, import_react.useState)();
	const [isLoading, setIsLoading] = (0, import_react.useState)(false);
	const debouncedValue = useDebounce(search, delayMs);
	const onStart = (0, import_react.useRef)(void 0);
	let client;
	if ("type" in clientRest) switch (clientRest.type) {
		case "fetch": {
			const { fetchClient } = (0, import_react.use)(promiseMap[clientRest.type] ??= import("./fetch-BiYbRyRG.mjs"));
			client = fetchClient(clientRest);
			break;
		}
		case "algolia": {
			const { algoliaClient } = (0, import_react.use)(promiseMap[clientRest.type] ??= import("./algolia-CAcgP4zS.mjs"));
			client = algoliaClient(clientRest);
			break;
		}
		case "orama-cloud": {
			const { oramaCloudClient } = (0, import_react.use)(promiseMap[clientRest.type] ??= import("./orama-cloud-BrqH6hBT.mjs"));
			client = oramaCloudClient(clientRest);
			break;
		}
		case "orama-cloud-legacy": {
			const { oramaCloudLegacyClient } = (0, import_react.use)(promiseMap[clientRest.type] ??= import("./orama-cloud-legacy-B7AIouRN.mjs"));
			client = oramaCloudLegacyClient(clientRest);
			break;
		}
		case "mixedbread": {
			const { mixedbreadClient } = (0, import_react.use)(promiseMap[clientRest.type] ??= import("./mixedbread-B44EOy-D.mjs"));
			client = mixedbreadClient(clientRest);
			break;
		}
		case "static": {
			const { oramaStaticClient } = (0, import_react.use)(promiseMap[clientRest.type] ??= import("./orama-static-69G95pm8.mjs"));
			client = oramaStaticClient(clientRest);
			break;
		}
		default: throw new Error("unknown search client");
	}
	else client = clientRest.client;
	useOnChange([deps ?? client.deps, debouncedValue], () => {
		if (onStart.current) {
			onStart.current();
			onStart.current = void 0;
		}
		setIsLoading(true);
		let interrupt = false;
		onStart.current = () => {
			interrupt = true;
		};
		async function run() {
			if (debouncedValue.length === 0 && !allowEmpty) return "empty";
			return client.search(debouncedValue);
		}
		run().then((res) => {
			if (interrupt) return;
			setError(void 0);
			setResults(res);
		}).catch((err) => {
			setError(err);
		}).finally(() => {
			setIsLoading(false);
		});
	});
	return {
		search,
		setSearch,
		query: {
			isLoading,
			data: results,
			error
		}
	};
}
//#endregion
export { SearchDialogHeader as a, SearchDialogList as c, TagsListItem as d, useDocsSearch as f, SearchDialogFooter as i, SearchDialogOverlay as l, SearchDialogClose as n, SearchDialogIcon as o, SearchDialogContent as r, SearchDialogInput as s, SearchDialog as t, TagsList as u };
