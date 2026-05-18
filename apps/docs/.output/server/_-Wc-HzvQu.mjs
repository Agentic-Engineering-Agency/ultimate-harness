import { i as __toESM } from "./_runtime.mjs";
import { c as lazyRouteComponent, l as createFileRoute } from "./_libs/@tanstack/react-router+[...].mjs";
import { i as TSS_SERVER_FUNCTION, l as createServerFn } from "./_ssr/esm-DaX-Y_xv.mjs";
import { t as __exportAll$1 } from "./_ssr/chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "./_libs/@radix-ui/react-arrow+[...].mjs";
import { a as staticFunctionMiddleware, i as normalizeUrl, n as findPath, r as gitConfig } from "./_ssr/staticFunctionMiddleware-DKfZ4dwE.mjs";
import { u as require_react } from "./_libs/@floating-ui/react-dom+[...].mjs";
import { C as ChevronDown, S as ChevronLeft, T as Airplay, _ as Clipboard, a as Search, b as ChevronsUpDown, c as Link, d as Info, g as CopyCheck, h as Copy, i as Sun, l as Lightbulb, m as ExternalLink, n as TriangleAlert, o as PanelLeft, r as Text, s as Moon, u as Languages, v as CircleX, w as Check, x as ChevronRight, y as CircleCheck } from "./_libs/lucide-react.mjs";
import { t as getServerFnById } from "./__23tanstack-start-server-fn-resolver-DPgA8-4I.mjs";
import { t as twMerge } from "./_libs/tailwind-merge.mjs";
import { t as cva } from "./_libs/class-variance-authority+clsx.mjs";
import { a as Link$2, c as useI18n, i as Image, l as useOnChange, n as I18nLabel, o as buttonVariants, s as isEqualShallow, u as usePathname } from "./_ssr/use-on-change-BlU-csFW.mjs";
import { t as e } from "./_libs/scroll-into-view-if-needed.mjs";
import { n as z } from "./_libs/next-themes.mjs";
import { a as Presence, n as CollapsibleTrigger$1, r as Root, t as CollapsibleContent$1 } from "./_libs/@radix-ui/react-collapsible+[...].mjs";
import { i as Trigger, n as Portal, r as Root2, t as Content2 } from "./_libs/@radix-ui/react-popover+[...].mjs";
import { a as Viewport, i as Scrollbar, n as Root$1, r as ScrollAreaThumb, t as Corner } from "./_libs/radix-ui__react-scroll-area.mjs";
import { i as TabsTrigger$1, n as TabsContent$1, r as TabsList$1, t as Tabs$1 } from "./_libs/radix-ui__react-tabs.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/_-Wc-HzvQu.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var SearchContext = (0, import_react.createContext)({
	enabled: false,
	open: false,
	hotKey: [],
	setOpenSearch: () => void 0
});
function useSearchContext() {
	return (0, import_react.use)(SearchContext);
}
function MetaOrControl() {
	const [key, setKey] = (0, import_react.useState)("⌘");
	(0, import_react.useEffect)(() => {
		if (/Windows|Linux/i.test(window.navigator.userAgent)) setKey("Ctrl");
	}, []);
	return key;
}
function SearchProvider({ SearchDialog, children, preload = true, options, hotKey = [{
	key: (e) => e.metaKey || e.ctrlKey,
	display: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaOrControl, {})
}, {
	key: "k",
	display: "K"
}], links }) {
	const [isOpen, setIsOpen] = (0, import_react.useState)(preload ? false : void 0);
	const onKeyDown = (0, import_react.useEffectEvent)((e) => {
		if (hotKey.every((v) => typeof v.key === "string" ? e.key === v.key : v.key(e))) {
			setIsOpen((open) => !open);
			e.preventDefault();
		}
	});
	(0, import_react.useEffect)(() => {
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [hotKey]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SearchContext, {
		value: (0, import_react.useMemo)(() => ({
			enabled: true,
			open: isOpen ?? false,
			hotKey,
			setOpenSearch: setIsOpen
		}), [isOpen, hotKey]),
		children: [isOpen !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, {
			fallback: null,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialog, {
				open: isOpen,
				onOpenChange: setIsOpen,
				links,
				...options
			})
		}), children]
	});
}
var Popover = Root2;
var PopoverTrigger = Trigger;
function PopoverContent({ className, align = "center", sideOffset = 4, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content2, {
		align,
		sideOffset,
		side: "bottom",
		className: twMerge("z-50 origin-(--radix-popover-content-transform-origin) overflow-y-auto max-h-(--radix-popover-content-available-height) min-w-[240px] max-w-[98vw] rounded-xl border bg-fd-popover/60 backdrop-blur-lg p-2 text-sm text-fd-popover-foreground shadow-lg focus-visible:outline-none data-[state=closed]:animate-fd-popover-out data-[state=open]:animate-fd-popover-in", className),
		...props
	}) });
}
function LanguageSelect({ className, variant = "ghost", children, ...rest }) {
	const context = useI18n();
	if (!context.locales) throw new Error("Missing `<I18nProvider />`");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
		"aria-label": context.text.chooseLanguage,
		className: twMerge(buttonVariants({ variant }), "gap-1.5 p-1.5 data-[state=open]:bg-fd-accent", className),
		...rest,
		children
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
		className: "flex flex-col gap-0.5 p-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "p-2 text-xs font-medium text-fd-muted-foreground",
			children: context.text.chooseLanguage
		}), context.locales.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: twMerge("px-2 py-1.5 text-start text-sm rounded-lg transition-colors", item.locale === context.locale ? "bg-fd-primary/10 text-fd-primary" : "text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground"),
			onClick: () => {
				context.onChange?.(item.locale);
			},
			children: item.name
		}, item.locale))]
	})] });
}
function LanguageSelectText(props) {
	const { locales, locale } = useI18n();
	const text = locales?.find((item) => item.locale === locale)?.name;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		...props,
		children: text
	});
}
function SearchTrigger({ hideIfDisabled, size = "icon-sm", color = "ghost", ...props }) {
	const { setOpenSearch, enabled } = useSearchContext();
	if (hideIfDisabled && !enabled) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: twMerge(buttonVariants({
			size,
			color
		}), props.className),
		"data-search": "",
		"aria-label": "Open Search",
		onClick: () => {
			setOpenSearch(true);
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {})
	});
}
function FullSearchTrigger({ hideIfDisabled, ...props }) {
	const { enabled, hotKey, setOpenSearch } = useSearchContext();
	const { text } = useI18n();
	if (hideIfDisabled && !enabled) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		"data-search-full": "",
		...props,
		className: twMerge("inline-flex items-center gap-2 rounded-lg border bg-fd-secondary/50 p-1.5 ps-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground", props.className),
		onClick: () => {
			setOpenSearch(true);
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "size-4" }),
			text.search,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "ms-auto inline-flex gap-0.5",
				children: hotKey.map((k, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
					className: "rounded-md border bg-fd-background px-1.5",
					children: k.display
				}, i))
			})
		]
	});
}
var itemVariants$1 = cva("size-6.5 p-1.5 text-fd-muted-foreground", { variants: { active: {
	true: "bg-fd-accent text-fd-accent-foreground",
	false: "text-fd-muted-foreground"
} } });
var full = [
	["light", Sun],
	["dark", Moon],
	["system", Airplay]
];
function ThemeSwitch({ className, mode = "light-dark", ...props }) {
	const { setTheme, theme, resolvedTheme } = z();
	const [mounted, setMounted] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setMounted(true);
	}, []);
	const container = twMerge("inline-flex items-center rounded-full border p-1 overflow-hidden *:rounded-full", className);
	if (mode === "light-dark") {
		const value = mounted ? resolvedTheme : null;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			className: container,
			"aria-label": `Toggle Theme`,
			onClick: () => setTheme(value === "light" ? "dark" : "light"),
			"data-theme-toggle": "",
			children: full.map(([key, Icon]) => {
				if (key === "system") return;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
					fill: "currentColor",
					className: twMerge(itemVariants$1({ active: value === key }))
				}, key);
			})
		});
	}
	const value = mounted ? theme : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: container,
		"data-theme-toggle": "",
		...props,
		children: full.map(([key, Icon]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			"aria-label": key,
			className: twMerge(itemVariants$1({ active: value === key })),
			onClick: () => setTheme(key),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
				className: "size-full",
				fill: "currentColor"
			})
		}, key))
	});
}
function normalize(urlOrPath) {
	if (urlOrPath.length > 1 && urlOrPath.endsWith("/")) return urlOrPath.slice(0, -1);
	return urlOrPath;
}
/**
* @returns if `href` is matching the given pathname
*/
function isActive(href, pathname, nested = false) {
	href = normalize(href);
	pathname = normalize(pathname);
	return href === pathname || nested && pathname.startsWith(`${href}/`);
}
var defaultTransform = (option, node) => {
	if (!node.icon) return option;
	return {
		...option,
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "size-full [&_svg]:size-full max-md:p-1.5 max-md:rounded-md max-md:border max-md:bg-fd-secondary",
			children: node.icon
		})
	};
};
function getLayoutTabs(tree, { transform = defaultTransform } = {}) {
	const results = [];
	function next(node, unlisted) {
		if ("root" in node && node.root) {
			const url = node.index?.url ?? node.children.find((node) => node.type === "page")?.url;
			if (url) {
				const option = {
					title: node.name,
					icon: node.icon,
					description: node.description,
					url,
					unlisted,
					$folder: node
				};
				const mapped = transform ? transform(option, node) : option;
				if (mapped) results.push(mapped);
			}
		}
		for (const child of node.children) if (child.type === "folder") next(child, unlisted);
	}
	next(tree);
	if (tree.fallback) next(tree.fallback, true);
	return results;
}
function isLayoutTabActive(tab, pathname) {
	if (tab.$folder) return findPath(tab.$folder.children, (node) => node.type === "page" && isActive(node.url, pathname)) !== null;
	if (tab.urls) return tab.urls.has(normalize(pathname));
	return isActive(tab.url, pathname, true);
}
/**
* Get link items with shortcuts
*/
function resolveLinkItems({ links = [], githubUrl }) {
	const result = [...links];
	if (githubUrl) result.push({
		type: "icon",
		url: githubUrl,
		text: "Github",
		label: "GitHub",
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
			role: "img",
			viewBox: "0 0 24 24",
			fill: "currentColor",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" })
		}),
		external: true
	});
	return result;
}
function useLinkItems({ githubUrl, links }) {
	return (0, import_react.useMemo)(() => {
		const all = resolveLinkItems({
			links,
			githubUrl
		});
		const navItems = [];
		const menuItems = [];
		for (const item of all) switch (item.on) {
			case "menu":
				menuItems.push(item);
				break;
			case "nav":
				navItems.push(item);
				break;
			default:
				navItems.push(item);
				menuItems.push(item);
		}
		return {
			navItems,
			menuItems,
			all
		};
	}, [links, githubUrl]);
}
function isLinkItemActive(link, pathname) {
	if (link.type === "custom" || !link.url) return false;
	if (link.active === "none") return false;
	return isActive(link.url, pathname, link.active === "nested-url");
}
var Link$1 = (0, import_react.forwardRef)(({ href = "#", external = href.match(/^\w+:/) || href.startsWith("//"), prefetch, children, ...props }, ref) => {
	if (external) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
		ref,
		href,
		rel: "noreferrer noopener",
		target: "_blank",
		...props,
		children
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link$2, {
		ref,
		href,
		prefetch,
		...props,
		children
	});
});
Link$1.displayName = "Link";
function LinkItem({ ref, item, ...props }) {
	const active = isLinkItemActive(item, usePathname());
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link$1, {
		ref,
		href: item.url,
		external: item.external,
		...props,
		"data-active": active,
		children: props.children
	});
}
function baseSlots({ useProps }) {
	function InlineThemeSwitch(props) {
		const { themeSwitch } = useProps();
		if (themeSwitch.component) return themeSwitch.component;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ThemeSwitch, {
			...props,
			...themeSwitch
		});
	}
	function InlineSearchTrigger(props) {
		const { searchToggle } = useProps();
		if (searchToggle.components?.sm) return searchToggle.components.sm;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchTrigger, {
			...props,
			...searchToggle.sm
		});
	}
	function InlineSearchTriggerFull(props) {
		const { searchToggle } = useProps();
		if (searchToggle.components?.lg) return searchToggle.components.lg;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FullSearchTrigger, {
			...props,
			...searchToggle.full
		});
	}
	function InlineNavTitle({ href: defaultUrl = "/", ...props }) {
		const { url = defaultUrl, title } = useProps().nav ?? {};
		if (typeof title === "function") return title({
			href: url,
			...props
		});
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link$1, {
			href: url,
			...props,
			children: title
		});
	}
	return { useProvider(options) {
		const { locales = [] } = useI18n();
		const { nav, slots = {}, i18n = locales.length > 1, searchToggle: { enabled: searchToggleEnabled = true, ...searchToggle } = {}, themeSwitch: { enabled: themeSwitchEnabled = true, ...themeSwitch } = {} } = options;
		return {
			baseSlots: {
				navTitle: slots.navTitle ?? InlineNavTitle,
				themeSwitch: themeSwitchEnabled && (slots.themeSwitch ?? InlineThemeSwitch),
				languageSelect: i18n ? slots.languageSelect ?? {
					root: LanguageSelect,
					text: LanguageSelectText
				} : false,
				searchTrigger: searchToggleEnabled && (slots.searchTrigger ?? {
					sm: InlineSearchTrigger,
					full: InlineSearchTriggerFull
				})
			},
			baseProps: {
				nav,
				searchToggle,
				themeSwitch
			}
		};
	} };
}
function useIsScrollTop({ enabled = true }) {
	const [isTop, setIsTop] = (0, import_react.useState)();
	(0, import_react.useEffect)(() => {
		if (!enabled) return;
		const listener = () => {
			setIsTop(window.scrollY < 10);
		};
		listener();
		window.addEventListener("scroll", listener);
		return () => {
			window.removeEventListener("scroll", listener);
		};
	}, [enabled]);
	return isTop;
}
var links = [
	{
		type: "main",
		text: "Docs",
		url: "/docs",
		active: "nested-url"
	},
	{
		type: "main",
		text: "GitHub",
		url: "https://github.com/Agentic-Engineering-Agency/ultimate-harness",
		external: true
	},
	{
		type: "main",
		text: "Linear",
		url: "https://linear.app/agentic-eng",
		external: true
	}
];
function baseOptions() {
	return {
		nav: { title: "Ultimate Harness" },
		links,
		githubUrl: "https://github.com/Agentic-Engineering-Agency/ultimate-harness"
	};
}
function browser() {
	return { doc(_name, glob) {
		return {
			raw: glob,
			createClientLoader({ id = _name, ...options }) {
				return createClientLoader(this.raw, {
					id,
					...options
				});
			}
		};
	} };
}
var loaderStore = /* @__PURE__ */ new Map();
function createClientLoader(globEntries, options) {
	const { id = "", component: useRenderer } = options;
	const renderers = {};
	const loaders = /* @__PURE__ */ new Map();
	const store = loaderStore.get(id) ?? { preloaded: /* @__PURE__ */ new Map() };
	loaderStore.set(id, store);
	for (const k in globEntries) loaders.set(k.startsWith("./") ? k.slice(2) : k, globEntries[k]);
	function getLoader(path) {
		const loader = loaders.get(path);
		if (!loader) throw new Error(`[createClientLoader] ${path} does not exist in available entries`);
		return loader;
	}
	function getRenderer(path) {
		if (path in renderers) return renderers[path];
		let promise;
		function Renderer(props) {
			let doc = store.preloaded.get(path);
			doc ??= (0, import_react.use)(promise ??= getLoader(path)());
			return useRenderer(doc, props);
		}
		return renderers[path] = Renderer;
	}
	return {
		async preload(path) {
			const loaded = await getLoader(path)();
			store.preloaded.set(path, loaded);
			return loaded;
		},
		getComponent(path) {
			return getRenderer(path);
		},
		useContent(path, props) {
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(getRenderer(path), { ...props });
		}
	};
}
var browserCollections = { docs: browser().doc("docs", /* @__PURE__ */ Object.assign({
	"./architecture/adapter-codex.mdx": () => import("./_ssr/adapter-codex-CNyLbsRI.mjs"),
	"./architecture/adapter-hermes-proxy.mdx": () => import("./_ssr/adapter-hermes-proxy-SJc9yNrc.mjs"),
	"./architecture/entities.mdx": () => import("./_ssr/entities-anCRtKZW.mjs"),
	"./architecture/harness-artifacts.mdx": () => import("./_ssr/harness-artifacts-fzHDQY_P.mjs"),
	"./architecture/hermes-proxy-spike.mdx": () => import("./_ssr/hermes-proxy-spike-CJcOVgBL.mjs"),
	"./architecture/mission-packet-schema.mdx": () => import("./_ssr/mission-packet-schema-B9dgvcFA.mjs"),
	"./architecture/overview.mdx": () => import("./_ssr/overview-DYb_3ygx.mjs"),
	"./architecture/runtime-adapter-contract.mdx": () => import("./_ssr/runtime-adapter-contract-BDbY8B4y.mjs"),
	"./architecture/sandbox-agentfs.mdx": () => import("./_ssr/sandbox-agentfs-DKQuDT3h.mjs"),
	"./architecture/sandboxing.mdx": () => import("./_ssr/sandboxing-CX0ABGe2.mjs"),
	"./architecture/skill-format.mdx": () => import("./_ssr/skill-format-DN71_Yt3.mjs"),
	"./architecture/tui.mdx": () => import("./_ssr/tui-Dfjq1838.mjs"),
	"./architecture/verification-and-promotion.mdx": () => import("./_ssr/verification-and-promotion-CLQRhUi3.mjs"),
	"./glossary.mdx": () => import("./_ssr/glossary-BCbwm27F.mjs"),
	"./index.mdx": () => import("./_ssr/docs-B6aD-S11.mjs"),
	"./product/mvp-scope.mdx": () => import("./_ssr/mvp-scope-lwLJmKRK.mjs"),
	"./product/non-goals.mdx": () => import("./_ssr/non-goals-CJpwR0tW.mjs"),
	"./product/personas.mdx": () => import("./_ssr/personas-BsU58UIz.mjs"),
	"./product/prd.mdx": () => import("./_ssr/prd-CtQXCqzj.mjs"),
	"./research/adopt-reject-defer.mdx": () => import("./_ssr/adopt-reject-defer-DbWxM4Sm.mjs"),
	"./research/comparison-matrix.mdx": () => import("./_ssr/comparison-matrix-Bhfam8QW.mjs"),
	"./research/inspiration-systems.mdx": () => import("./_ssr/inspiration-systems-DtwbxA3q.mjs"),
	"./research/tui-framework.mdx": () => import("./_ssr/tui-framework-C1RO0OWk.mjs"),
	"./roadmap.mdx": () => import("./_ssr/roadmap-Ge245tcX.mjs"),
	"./runbooks/anthropic-via-omp.mdx": () => import("./_ssr/anthropic-via-omp-Bxr4X2AX.mjs"),
	"./runbooks/codex-e2e-smoke.mdx": () => import("./_ssr/codex-e2e-smoke-CYj6c1Vu.mjs"),
	"./runbooks/hermes-proxy-e2e-smoke.mdx": () => import("./_ssr/hermes-proxy-e2e-smoke-DRBogL5I.mjs"),
	"./runbooks/hermes-proxy-setup.mdx": () => import("./_ssr/hermes-proxy-setup-LUPt3gB3.mjs"),
	"./runbooks/using-the-tui.mdx": () => import("./_ssr/using-the-tui-D41bgqsd.mjs"),
	"./verification/audit-trail.mdx": () => import("./_ssr/audit-trail-B1AGQcWb.mjs"),
	"./verification/checks.mdx": () => import("./_ssr/checks-DnRktOLB.mjs"),
	"./verification/review-gates.mdx": () => import("./_ssr/review-gates-B2gDgQO8.mjs"),
	"./verification/strategy.mdx": () => import("./_ssr/strategy-hw5_goKI.mjs"),
	"./workflows/bmad-agent-map.mdx": () => import("./_ssr/bmad-agent-map-CBbDrZjL.mjs"),
	"./workflows/mission-to-sandbox.mdx": () => import("./_ssr/mission-to-sandbox-BvBKK5xC.mjs"),
	"./workflows/overview.mdx": () => import("./_ssr/overview-B-M4Rlxx.mjs"),
	"./workflows/plan-to-mission.mdx": () => import("./_ssr/plan-to-mission-Cwn2bEMM.mjs"),
	"./workflows/research-to-spec.mdx": () => import("./_ssr/research-to-spec-CGkOGx_W.mjs"),
	"./workflows/spec-to-plan.mdx": () => import("./_ssr/spec-to-plan-Bc5CuwoP.mjs"),
	"./workflows/verify-review-promote.mdx": () => import("./_ssr/verify-review-promote-DcYZTQ88.mjs")
})) };
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
function mergeRefs$1(...refs) {
	return (value) => {
		refs.forEach((ref) => {
			if (typeof ref === "function") ref(value);
			else if (ref) ref.current = value;
		});
	};
}
var toc_exports = /* @__PURE__ */ __exportAll$1({
	AnchorProvider: () => AnchorProvider,
	ScrollProvider: () => ScrollProvider,
	TOCItem: () => TOCItem$2,
	useActiveAnchor: () => useActiveAnchor$1,
	useActiveAnchors: () => useActiveAnchors$1,
	useItems: () => useItems$1,
	useTOC: () => useTOC,
	useTOCListener: () => useTOCListener,
	useTOCSelector: () => useTOCSelector
});
function mergeRefs(...refs) {
	return (value) => {
		refs.forEach((ref) => {
			if (typeof ref === "function") ref(value);
			else if (ref != null) ref.current = value;
		});
	};
}
var ObserverContext = (0, import_react.createContext)(null);
var ScrollContext = (0, import_react.createContext)(null);
/** Optional: add auto-scroll to TOC items. */
function ScrollProvider({ containerRef, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollContext, {
		value: containerRef,
		children
	});
}
function AnchorProvider({ toc, single = false, children }) {
	const observer = (0, import_react.useMemo)(() => new Observer(), []);
	observer.single = single;
	(0, import_react.useEffect)(() => {
		observer.setItems(toc);
	}, [observer, toc]);
	(0, import_react.useEffect)(() => {
		observer.watch({ threshold: .9 });
		return () => observer.unwatch();
	}, [observer]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ObserverContext, {
		value: observer,
		children
	});
}
function TOCItem$2({ ref, onActiveChange = () => null, ...props }) {
	const id = props.href ? getItemId(props.href) : null;
	const containerRef = (0, import_react.use)(ScrollContext);
	const anchorRef = (0, import_react.useRef)(null);
	const observer = useObserver();
	const [active, setActive] = (0, import_react.useState)(() => observer.items.some((item) => item.id === id && item.active));
	function autoScroll(items, instant = false) {
		const anchor = anchorRef.current;
		const container = containerRef?.current;
		if (!id || !anchor || !container) return;
		let lastActive;
		for (const item of items) {
			if (!item.active) continue;
			if (!lastActive || lastActive.t < item.t) lastActive = item;
		}
		if (lastActive?.id === id) e(anchor, {
			behavior: instant ? "instant" : "smooth",
			block: "center",
			inline: "center",
			scrollMode: "always",
			boundary: container
		});
	}
	useTOCListener((items) => {
		const itemData = id ? items.find((item) => item.id === id) : null;
		if (itemData && itemData.active !== active) {
			setActive(itemData.active);
			onActiveChange(itemData.active);
			autoScroll(items);
		}
	});
	(0, import_react.useEffect)(() => {
		autoScroll(observer.items, true);
	}, [observer]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
		ref: mergeRefs(anchorRef, ref),
		"data-active": active,
		...props
	});
}
function useObserver() {
	const observer = (0, import_react.use)(ObserverContext);
	if (!observer) throw new Error(`Component must be used under the <AnchorProvider /> component.`);
	return observer;
}
/** @returns static info object, useful for custom rendering logic */
function useTOC() {
	const observer = useObserver();
	return (0, import_react.useMemo)(() => ({
		get() {
			return observer.items;
		},
		listen: observer.listen.bind(observer),
		unlisten: observer.unlisten.bind(observer)
	}), [observer]);
}
function useTOCListener(listener) {
	const observer = useObserver();
	const callback = (0, import_react.useEffectEvent)(listener);
	(0, import_react.useEffect)(() => {
		observer.listen(callback);
		return () => observer.unlisten(callback);
	}, [observer]);
}
function useTOCSelector(select, isEqual = isEqualShallow) {
	const observer = useObserver();
	const [value, setValue] = (0, import_react.useState)(() => select(observer.items));
	useTOCListener((items) => {
		const next = select(items);
		if (!isEqual(value, next)) setValue(next);
	});
	return value;
}
/**
* The estimated active heading ID
*/
function useActiveAnchor$1() {
	return useTOCSelector((items) => {
		let out;
		for (const item of items) {
			if (!item.active) continue;
			if (!out || item.t > out.t) out = item;
		}
		return out?.id;
	});
}
/**
* The id of visible anchors
*/
function useActiveAnchors$1() {
	return useTOCSelector((items) => {
		const out = [];
		for (const item of items) if (item.active) out.push(item.id);
		return out;
	});
}
function useItems$1() {
	return useTOCSelector((items) => items);
}
function getItemId(url) {
	if (url.startsWith("#")) return url.slice(1);
	return null;
}
var Observer = class {
	constructor() {
		this.items = [];
		this.single = false;
		this.observer = null;
		this.listeners = /* @__PURE__ */ new Set();
	}
	listen(listener) {
		this.listeners.add(listener);
	}
	unlisten(listener) {
		this.listeners.delete(listener);
	}
	setItems(newItems) {
		const observer = this.observer;
		if (observer) for (const item of this.items) {
			const element = document.getElementById(item.id);
			if (!element) continue;
			observer.unobserve(element);
		}
		const next = [];
		for (const item of newItems) {
			const id = getItemId(item.url);
			if (!id) continue;
			next.push({
				id,
				active: false,
				fallback: false,
				t: 0,
				original: item
			});
		}
		this.update(next);
		this.observeItems();
	}
	watch(options) {
		if (this.observer) return;
		this.observer = new IntersectionObserver(this.callback.bind(this), options);
		this.observeItems();
	}
	unwatch() {
		this.observer?.disconnect();
		this.observer = null;
	}
	callback(entries) {
		if (entries.length === 0) return;
		let hasActive = false;
		const updated = this.items.map((item) => {
			const entry = entries.find((entry) => entry.target.id === item.id);
			let active = entry ? entry.isIntersecting : item.active && !item.fallback;
			if (this.single && hasActive) active = false;
			if (item.active !== active) item = {
				...item,
				t: Date.now(),
				active,
				fallback: false
			};
			if (active) hasActive = true;
			return item;
		});
		if (!hasActive && entries[0].rootBounds) {
			const viewTop = entries[0].rootBounds.top;
			let min = Number.MAX_VALUE;
			let fallbackIdx = -1;
			for (let i = 0; i < updated.length; i++) {
				const element = document.getElementById(updated[i].id);
				if (!element) continue;
				const d = Math.abs(viewTop - element.getBoundingClientRect().top);
				if (d < min) {
					fallbackIdx = i;
					min = d;
				}
			}
			if (fallbackIdx !== -1) updated[fallbackIdx] = {
				...updated[fallbackIdx],
				active: true,
				fallback: true,
				t: Date.now()
			};
		}
		this.update(updated);
	}
	observeItems() {
		if (!this.observer) return;
		for (const item of this.items) {
			const element = document.getElementById(item.id);
			if (!element) continue;
			this.observer.observe(element);
		}
	}
	update(next) {
		this.items = next;
		for (const listener of this.listeners) listener(next);
	}
};
var TOCContext = (0, import_react.createContext)([]);
function useTOCItems() {
	return (0, import_react.use)(TOCContext);
}
var { useActiveAnchor, useActiveAnchors, useItems } = toc_exports;
function TOCProvider$1({ toc, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCContext, {
		value: toc,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AnchorProvider, {
			toc,
			...props,
			children
		})
	});
}
function TOCScrollArea({ ref, className, ...props }) {
	const viewRef = (0, import_react.useRef)(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: mergeRefs$1(viewRef, ref),
		className: twMerge("relative min-h-0 text-sm ms-px overflow-auto [scrollbar-width:none] mask-[linear-gradient(to_bottom,transparent,white_16px,white_calc(100%-16px),transparent)] py-3", className),
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollProvider, {
			containerRef: viewRef,
			children: props.children
		})
	});
}
var default_exports = /* @__PURE__ */ __exportAll({
	TOCEmpty: () => TOCEmpty$1,
	TOCItem: () => TOCItem$1,
	TOCItems: () => TOCItems$1
});
function TOCItems$1({ ref, className, ...props }) {
	const containerRef = (0, import_react.useRef)(null);
	const items = useTOCItems();
	const [computed, setComputed] = (0, import_react.useState)(null);
	const onCompute = (0, import_react.useCallback)(() => {
		const container = containerRef.current;
		if (!container) return;
		if (items.length === 0) {
			setComputed(null);
			return;
		}
		const positions = [];
		for (const item of items) {
			const element = container.querySelector(`a[href="${item.url}"]`);
			if (!element) continue;
			const styles = getComputedStyle(element);
			positions.push([element.offsetTop + parseFloat(styles.paddingTop), element.offsetTop + element.clientHeight - parseFloat(styles.paddingBottom)]);
		}
		setComputed({ positions });
	}, [items]);
	(0, import_react.useEffect)(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new ResizeObserver(onCompute);
		observer.observe(container);
		onCompute();
		return () => {
			observer.disconnect();
		};
	}, [onCompute]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative",
		children: [computed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TocThumb, { computed }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			ref: mergeRefs$1(ref, containerRef),
			className: twMerge("flex flex-col border-s border-fd-foreground/10", className),
			...props
		})]
	});
}
function TocThumb({ computed }) {
	const ref = (0, import_react.useRef)(null);
	const tocInfo = useTOC();
	function calculate(items) {
		const out = {};
		const startIdx = items.findIndex((item) => item.active);
		if (startIdx === -1) return out;
		const endIdx = items.findLastIndex((item) => item.active);
		out["--track-top"] = `${computed.positions[startIdx][0]}px`;
		out["--track-bottom"] = `${computed.positions[endIdx][1]}px`;
		return out;
	}
	useTOCListener((items) => {
		const element = ref.current;
		if (!element) return;
		for (const [k, v] of Object.entries(calculate(items))) element.style.setProperty(k, v);
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref,
		className: "absolute inset-y-0 inset-s-0 bg-fd-primary w-px transition-[clip-path]",
		style: {
			clipPath: `polygon(0 var(--track-top,0), 100% var(--track-top,0), 100% var(--track-bottom,0), 0 var(--track-bottom,0))`,
			...calculate(tocInfo.get())
		}
	});
}
function TOCEmpty$1() {
	const { text } = useI18n();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-lg border bg-fd-card p-3 text-xs text-fd-muted-foreground",
		children: text.tocNoHeadings
	});
}
function TOCItem$1({ item, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCItem$2, {
		href: item.url,
		...props,
		className: twMerge("prose py-1.5 text-sm text-fd-muted-foreground scroll-m-4 transition-colors wrap-anywhere first:pt-0 last:pb-0 data-[active=true]:text-fd-primary hover:text-fd-accent-foreground", item.depth <= 2 && "ps-3", item.depth === 3 && "ps-6", item.depth >= 4 && "ps-8", props.className),
		children: item.title
	});
}
var clerk_exports = /* @__PURE__ */ __exportAll({
	TOCEmpty: () => TOCEmpty,
	TOCItem: () => TOCItem,
	TOCItems: () => TOCItems
});
function TOCItems({ ref, className, thumbBox = true, children, ...props }) {
	const containerRef = (0, import_react.useRef)(null);
	const items = useTOCItems();
	const [svg, setSvg] = (0, import_react.useState)(null);
	const onPrint = (0, import_react.useCallback)(() => {
		const container = containerRef.current;
		if (!container || container.clientHeight === 0) return;
		if (items.length === 0) {
			setSvg(null);
			return;
		}
		let w = 0;
		let h = 0;
		let d = "";
		const positions = [];
		const output = [];
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const element = container.querySelector(`a[href="${item.url}"]`);
			if (!element) continue;
			const styles = getComputedStyle(element);
			const x = getLineOffset(item.depth) + .5;
			const top = element.offsetTop + parseFloat(styles.paddingTop);
			const bottom = element.offsetTop + element.clientHeight - parseFloat(styles.paddingBottom);
			w = Math.max(x + 8, w);
			h = Math.max(h, bottom);
			if (i === 0) d += ` M${x} ${top} L${x} ${bottom}`;
			else {
				const [, upperBottom, upperX] = i > 0 ? positions[i - 1] : [
					0,
					0,
					0
				];
				d += ` C ${upperX} ${top - 4} ${x} ${upperBottom + 4} ${x} ${top} L${x} ${bottom}`;
			}
			if (item._step !== void 0) output.push(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
				transform: `translate(${x}, ${(top + bottom) / 2})`,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
					cx: "0",
					cy: "0",
					r: "8",
					className: "fill-fd-primary"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
					cx: "0",
					cy: "0",
					textAnchor: "middle",
					alignmentBaseline: "central",
					dominantBaseline: "middle",
					className: "fill-fd-primary-foreground font-medium text-xs leading-none font-mono rtl:-scale-x-100",
					children: item._step
				})]
			}, i));
			positions.push([
				top,
				bottom,
				x
			]);
		}
		output.unshift(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d,
			className: "stroke-fd-primary",
			strokeWidth: "1",
			fill: "none"
		}, "path"));
		const itemLineLengths = [];
		if (thumbBox) {
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", d);
			const n = path.getTotalLength();
			for (let i = 0; i < positions.length; i++) {
				const [top, bottom] = positions[i];
				let l = i > 0 ? itemLineLengths[i - 1][1] + (top - positions[i - 1][1]) : top;
				while (l < n && path.getPointAtLength(l).y < top) l++;
				itemLineLengths.push([l, l + bottom - top]);
			}
		}
		setSvg({
			content: output,
			width: w,
			height: h,
			d,
			itemLineLengths,
			positions
		});
	}, [items, thumbBox]);
	(0, import_react.useEffect)(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new ResizeObserver(onPrint);
		observer.observe(container);
		onPrint();
		return () => {
			observer.unobserve(container);
		};
	}, [onPrint]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: mergeRefs$1(containerRef, ref),
		className: twMerge("relative flex flex-col", className),
		...props,
		children: [svg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ThumbTrack, {
			computed: svg,
			thumbBox
		}), children]
	});
}
function TOCEmpty() {
	const { text } = useI18n();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-lg border bg-fd-card p-3 text-xs text-fd-muted-foreground",
		children: text.tocNoHeadings
	});
}
function ThumbTrack({ computed, thumbBox }) {
	const ref = (0, import_react.useRef)(null);
	const previousRef = (0, import_react.useRef)(null);
	const tocInfo = useTOC();
	function calculate(items) {
		const out = {};
		const startIdx = items.findIndex((item) => item.active);
		if (startIdx === -1) return out;
		const endIdx = items.findLastIndex((item) => item.active);
		out["--track-top"] = `${computed.positions[startIdx][0]}px`;
		out["--track-bottom"] = `${computed.positions[endIdx][1]}px`;
		if (thumbBox) {
			let isUp = false;
			if (previousRef.current) {
				const prev = previousRef.current;
				isUp = prev.startIdx > startIdx || prev.endIdx > endIdx || prev.startIdx === startIdx && prev.endIdx === endIdx && prev.isUp;
			}
			previousRef.current = {
				startIdx,
				endIdx,
				isUp
			};
			out["--offset-distance"] = isUp ? `${computed.itemLineLengths[startIdx][0]}px` : `${computed.itemLineLengths[endIdx][1]}px`;
			out["--opacity"] = items[isUp ? startIdx : endIdx].original._step !== void 0 ? "0" : "1";
		}
		return out;
	}
	useTOCListener((items) => {
		const element = ref.current;
		if (!element) return;
		for (const [k, v] of Object.entries(calculate(items))) element.style.setProperty(k, v);
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref,
		className: "absolute top-0 inset-s-0 origin-center rtl:-scale-x-100",
		style: {
			width: computed.width,
			height: computed.height,
			...calculate(tocInfo.get())
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
			xmlns: "http://www.w3.org/2000/svg",
			viewBox: `0 0 ${computed.width} ${computed.height}`,
			className: "absolute transition-[clip-path]",
			style: {
				width: computed.width,
				height: computed.height,
				clipPath: `polygon(0 var(--track-top,0), 100% var(--track-top,0), 100% var(--track-bottom,0), 0 var(--track-bottom,0))`
			},
			children: computed.content
		}), thumbBox && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "absolute left-0 size-1 bg-fd-primary rounded-full [offset-distance:var(--offset-distance,0)] opacity-(--opacity,0) transition-[opacity,offset-distance]",
			style: { offsetPath: `path("${computed.d}")` }
		})]
	});
}
var a = 8;
function getItemOffset$1(depth) {
	if (depth <= 2) return 12 + a;
	if (depth === 3) return 24 + a;
	return 36 + a;
}
function getLineOffset(depth) {
	if (depth <= 2) return a;
	if (depth === 3) return 8 + a;
	return 16 + a;
}
function TOCItem({ item, ...props }) {
	const items = useTOCItems();
	const { isFirst, isLast, svg } = (0, import_react.useMemo)(() => {
		const index = items.indexOf(item);
		const isFirst = index === 0;
		const isLast = index === items.length - 1;
		const l1 = getLineOffset(item.depth);
		const l0 = isFirst ? l1 : getLineOffset(items[index - 1].depth);
		const l2 = isLast ? l1 : getLineOffset(items[index + 1].depth);
		return {
			isFirst,
			isLast,
			svg: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
				xmlns: "http://www.w3.org/2000/svg",
				className: twMerge("absolute -top-1.5 inset-s-0 bottom-0 h-[calc(100%+--spacing(1.5))] -z-1 rtl:-scale-x-100", l1 !== l2 && "h-full bottom-1.5"),
				style: { width: Math.max(l0, l1) + 9 },
				children: [
					l0 !== l1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: `M ${l0 + .5} 0 C ${l0 + .5} 8 ${l1 + .5} 4 ${l1 + .5} 12`,
						stroke: "black",
						strokeWidth: "1",
						fill: "none",
						className: "stroke-fd-foreground/10"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
						x1: l1 + .5,
						y1: l0 === l1 ? "6" : "12",
						x2: l1 + .5,
						y2: "100%",
						strokeWidth: "1",
						className: "stroke-fd-foreground/10"
					}),
					item._step !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
						transform: `translate(${l1 + .5}, ${l1 === l2 ? "3" : "6"})`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
							cx: "0",
							cy: "50%",
							r: "8",
							className: "fill-fd-muted"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
							x: "0",
							y: "50%",
							textAnchor: "middle",
							alignmentBaseline: "central",
							dominantBaseline: "middle",
							className: "fill-fd-muted-foreground font-medium text-xs leading-none font-mono rtl:-scale-x-100",
							children: item._step
						})]
					})
				]
			})
		};
	}, [items, item]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TOCItem$2, {
		href: item.url,
		...props,
		className: twMerge("prose relative py-1.5 text-sm scroll-m-4 text-fd-muted-foreground hover:text-fd-accent-foreground transition-colors wrap-anywhere data-[active=true]:text-fd-primary", isFirst && "pt-0", isLast && "pb-0", props.className),
		style: {
			paddingInlineStart: getItemOffset$1(item.depth),
			...props.style
		},
		children: [svg, item.title]
	});
}
function getBreadcrumbItemsFromPath(tree, path, options) {
	const { includePage = false, includeSeparator = false, includeRoot = false } = options;
	let items = [];
	for (let i = 0; i < path.length; i++) {
		const item = path[i];
		switch (item.type) {
			case "page":
				if (includePage) items.push({
					name: item.name,
					url: item.url
				});
				break;
			case "folder":
				if (item.root) {
					items = [];
					if (includeRoot) items.push({
						name: tree.name,
						url: typeof includeRoot === "object" ? includeRoot.url : item.index?.url
					});
					break;
				}
				if (i === path.length - 1 || item.index !== path[i + 1]) items.push({
					name: item.name,
					url: item.index?.url
				});
				break;
			case "separator":
				if (item.name && includeSeparator) items.push({ name: item.name });
				break;
		}
	}
	return items;
}
/**
* Search the path of a node in the tree by a specified url
*
* - When the page doesn't exist, return null
*
* @returns The path to the target node from root
* @internal Don't use this on your own
*/
function searchPath(nodes, url) {
	const normalizedUrl = normalizeUrl(url);
	return findPath(nodes, (node) => node.type === "page" && node.url === normalizedUrl);
}
var TreeContext = (0, import_react.createContext)(null);
var PathContext = (0, import_react.createContext)([]);
function TreeContextProvider({ tree: rawTree, children }) {
	const nextIdRef = (0, import_react.useRef)(0);
	const pathname = usePathname();
	const tree = (0, import_react.useMemo)(() => rawTree, [rawTree.$id ?? rawTree]);
	const path = (0, import_react.useMemo)(() => {
		return searchPath(tree.children, pathname) ?? (tree.fallback ? searchPath(tree.fallback.children, pathname) : null) ?? [];
	}, [tree, pathname]);
	const root = path.findLast((item) => item.type === "folder" && item.root) ?? tree;
	root.$id ??= String(nextIdRef.current++);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeContext, {
		value: (0, import_react.useMemo)(() => ({
			root,
			full: tree
		}), [root, tree]),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PathContext, {
			value: path,
			children
		})
	});
}
function useTreePath() {
	return (0, import_react.use)(PathContext);
}
function useTreeContext() {
	const ctx = (0, import_react.use)(TreeContext);
	if (!ctx) throw new Error("You must wrap this component under <DocsLayout />");
	return ctx;
}
var Collapsible = Root;
var CollapsibleTrigger = CollapsibleTrigger$1;
function CollapsibleContent({ children, ...props }) {
	const [mounted, setMounted] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setMounted(true);
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollapsibleContent$1, {
		...props,
		className: twMerge("overflow-hidden", mounted && "data-[state=closed]:animate-fd-collapsible-up data-[state=open]:animate-fd-collapsible-down", props.className),
		children
	});
}
function ScrollArea({ className, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Root$1, {
		type: "scroll",
		className: twMerge("overflow-hidden", className),
		...props,
		children: [
			children,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Corner, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollBar, { orientation: "vertical" })
		]
	});
}
function ScrollViewport({ className, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Viewport, {
		className: twMerge("size-full rounded-[inherit]", className),
		...props,
		children
	});
}
function ScrollBar({ className, orientation = "vertical", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scrollbar, {
		orientation,
		className: twMerge("flex select-none data-[state=hidden]:animate-fd-fade-out", orientation === "vertical" && "h-full w-1.5", orientation === "horizontal" && "h-1.5 flex-col", className),
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollAreaThumb, { className: "relative flex-1 rounded-full bg-fd-border" })
	});
}
function useMediaQuery(query, disabled = false) {
	const [isMatch, setMatch] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		if (disabled) return;
		const mediaQueryList = window.matchMedia(query);
		const handleChange = () => {
			setMatch(mediaQueryList.matches);
		};
		handleChange();
		mediaQueryList.addEventListener("change", handleChange);
		return () => {
			mediaQueryList.removeEventListener("change", handleChange);
		};
	}, [disabled, query]);
	return isMatch;
}
var base_exports = /* @__PURE__ */ __exportAll({
	SidebarCollapseTrigger: () => SidebarCollapseTrigger$1,
	SidebarContent: () => SidebarContent$1,
	SidebarDrawerContent: () => SidebarDrawerContent,
	SidebarDrawerOverlay: () => SidebarDrawerOverlay,
	SidebarFolder: () => SidebarFolder$1,
	SidebarFolderContent: () => SidebarFolderContent$1,
	SidebarFolderLink: () => SidebarFolderLink$1,
	SidebarFolderTrigger: () => SidebarFolderTrigger$1,
	SidebarItem: () => SidebarItem$1,
	SidebarProvider: () => SidebarProvider$1,
	SidebarSeparator: () => SidebarSeparator$1,
	SidebarTrigger: () => SidebarTrigger$1,
	SidebarViewport: () => SidebarViewport,
	useAutoScroll: () => useAutoScroll,
	useFolder: () => useFolder,
	useFolderDepth: () => useFolderDepth,
	useSidebar: () => useSidebar$1
});
var SidebarContext = (0, import_react.createContext)(null);
var FolderContext = (0, import_react.createContext)(null);
function SidebarProvider$1({ defaultOpenLevel = 0, prefetch, children }) {
	const closeOnRedirect = (0, import_react.useRef)(true);
	const [open, setOpen] = (0, import_react.useState)(false);
	const [collapsed, setCollapsed] = (0, import_react.useState)(false);
	const pathname = usePathname();
	const mode = useMediaQuery("(width < 768px)") ? "drawer" : "full";
	useOnChange(pathname, () => {
		if (closeOnRedirect.current) setOpen(false);
		closeOnRedirect.current = true;
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarContext, {
		value: (0, import_react.useMemo)(() => ({
			open,
			setOpen,
			collapsed,
			setCollapsed,
			closeOnRedirect,
			defaultOpenLevel,
			prefetch,
			mode
		}), [
			open,
			collapsed,
			defaultOpenLevel,
			prefetch,
			mode
		]),
		children
	});
}
function useSidebar$1() {
	const ctx = (0, import_react.use)(SidebarContext);
	if (!ctx) throw new Error("Missing SidebarContext, make sure you have wrapped the component in <DocsLayout /> and the context is available.");
	return ctx;
}
function useFolder() {
	return (0, import_react.use)(FolderContext);
}
function useFolderDepth() {
	return (0, import_react.use)(FolderContext)?.depth ?? 0;
}
function SidebarContent$1({ mode: allowedMode = "full", children }) {
	const { collapsed, mode } = useSidebar$1();
	const [hover, setHover] = (0, import_react.useState)(false);
	const ref = (0, import_react.useRef)(null);
	const timerRef = (0, import_react.useRef)(0);
	useOnChange(collapsed, () => {
		if (collapsed) setHover(false);
	});
	if (allowedMode !== true && allowedMode !== mode) return;
	function shouldIgnoreHover(e) {
		const element = ref.current;
		if (!element) return true;
		return !collapsed || e.pointerType === "touch" || element.getAnimations().length > 0;
	}
	return children({
		ref,
		collapsed,
		hovered: hover,
		onPointerEnter(e) {
			if (shouldIgnoreHover(e)) return;
			window.clearTimeout(timerRef.current);
			setHover(true);
		},
		onPointerLeave(e) {
			if (shouldIgnoreHover(e)) return;
			window.clearTimeout(timerRef.current);
			timerRef.current = window.setTimeout(() => setHover(false), Math.min(e.clientX, document.body.clientWidth - e.clientX) > 100 ? 0 : 500);
		}
	});
}
function SidebarViewport({ area, viewport, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollArea, {
		...area,
		className: twMerge("min-h-0 flex-1", area?.className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollViewport, {
			...viewport,
			className: twMerge("*:flex! *:flex-col! *:gap-0.5! p-4 overscroll-contain mask-[linear-gradient(to_bottom,transparent,white_12px,white_calc(100%-12px),transparent)]", viewport?.className),
			children
		})
	});
}
function SidebarDrawerOverlay(props) {
	const { open, setOpen, mode } = useSidebar$1();
	if (mode !== "drawer") return;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Presence, {
		present: open,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			"data-state": open ? "open" : "closed",
			onClick: () => setOpen(false),
			...props
		})
	});
}
function SidebarDrawerContent({ className, children, ...props }) {
	const { open, mode } = useSidebar$1();
	const state = open ? "open" : "closed";
	if (mode !== "drawer") return;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Presence, {
		present: open,
		children: ({ present }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
			id: "nd-sidebar-mobile",
			"data-state": state,
			className: twMerge(!present && "invisible", className),
			...props,
			children
		})
	});
}
function SidebarSeparator$1(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { ...props });
}
function SidebarItem$1({ icon, active = false, children, ...props }) {
	const ref = (0, import_react.useRef)(null);
	const { prefetch } = useSidebar$1();
	useAutoScroll(active, ref);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link$1, {
		ref,
		"data-active": active,
		prefetch,
		...props,
		children: [icon ?? (props.external ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, {}) : null), children]
	});
}
function SidebarFolder$1({ defaultOpen: defaultOpenProp, collapsible = true, active = false, children, ...props }) {
	const { defaultOpenLevel } = useSidebar$1();
	const depth = useFolderDepth() + 1;
	const defaultOpen = collapsible === false || active || (defaultOpenProp ?? defaultOpenLevel >= depth);
	const [open, setOpen] = (0, import_react.useState)(defaultOpen);
	useOnChange(defaultOpen, (v) => {
		if (v) setOpen(v);
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Collapsible, {
		open,
		onOpenChange: setOpen,
		disabled: !collapsible,
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderContext, {
			value: (0, import_react.useMemo)(() => ({
				open,
				setOpen,
				depth,
				collapsible
			}), [
				collapsible,
				depth,
				open
			]),
			children
		})
	});
}
function SidebarFolderTrigger$1({ children, ...props }) {
	const { open, collapsible } = (0, import_react.use)(FolderContext);
	if (collapsible) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CollapsibleTrigger, {
		...props,
		children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
			"data-icon": true,
			className: twMerge("ms-auto transition-transform", !open && "-rotate-90 rtl:rotate-90")
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		children
	});
}
function SidebarFolderLink$1({ children, active = false, ...props }) {
	const ref = (0, import_react.useRef)(null);
	const { open, setOpen, collapsible } = (0, import_react.use)(FolderContext);
	const { prefetch } = useSidebar$1();
	useAutoScroll(active, ref);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link$1, {
		ref,
		"data-active": active,
		onClick: (e) => {
			if (!collapsible) return;
			if (e.target instanceof Element && e.target.matches("[data-icon], [data-icon] *")) {
				setOpen(!open);
				e.preventDefault();
			} else setOpen(active ? !open : true);
		},
		prefetch,
		...props,
		children: [children, collapsible && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
			"data-icon": true,
			className: twMerge("ms-auto transition-transform", !open && "-rotate-90 rtl:rotate-90")
		})]
	});
}
function SidebarFolderContent$1(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollapsibleContent, {
		...props,
		children: props.children
	});
}
function SidebarTrigger$1({ children, ...props }) {
	const { setOpen } = useSidebar$1();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		"aria-label": "Open Sidebar",
		onClick: () => setOpen((prev) => !prev),
		...props,
		children
	});
}
function SidebarCollapseTrigger$1(props) {
	const { collapsed, setCollapsed } = useSidebar$1();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		"aria-label": "Collapse Sidebar",
		"data-collapsed": collapsed,
		onClick: () => {
			setCollapsed((prev) => !prev);
		},
		...props,
		children: props.children
	});
}
/**
* scroll to the element if `active` is true
*/
function useAutoScroll(active, ref) {
	const { mode } = useSidebar$1();
	(0, import_react.useEffect)(() => {
		if (active && ref.current) e(ref.current, {
			boundary: document.getElementById(mode === "drawer" ? "nd-sidebar-mobile" : "nd-sidebar"),
			scrollMode: "if-needed"
		});
	}, [
		active,
		mode,
		ref
	]);
}
var RendererContext = (0, import_react.createContext)(null);
function createPageTreeRenderer({ SidebarFolder, SidebarFolderContent, SidebarFolderLink, SidebarFolderTrigger, SidebarSeparator, SidebarItem }) {
	function renderList(nodes) {
		return nodes.map((node, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageTreeNode, { node }, i));
	}
	function PageTreeNode({ node }) {
		const { Separator, Item, Folder, pathname } = (0, import_react.use)(RendererContext);
		if (node.type === "separator") {
			if (Separator) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, { item: node });
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarSeparator, { children: [node.icon, node.name] });
		}
		if (node.type === "folder") {
			const path = useTreePath();
			if (Folder) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Folder, {
				item: node,
				children: renderList(node.children)
			});
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarFolder, {
				collapsible: node.collapsible,
				active: path.includes(node),
				defaultOpen: node.defaultOpen,
				children: [node.index ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarFolderLink, {
					href: node.index.url,
					active: isActive(node.index.url, pathname),
					external: node.index.external,
					children: [node.icon, node.name]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarFolderTrigger, { children: [node.icon, node.name] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarFolderContent, { children: renderList(node.children) })]
			});
		}
		if (Item) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Item, { item: node });
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarItem, {
			href: node.url,
			external: node.external,
			active: isActive(node.url, pathname),
			icon: node.icon,
			children: node.name
		});
	}
	/**
	* Render sidebar items from page tree
	*/
	return function SidebarPageTree(components) {
		const { Folder, Item, Separator } = components;
		const { root } = useTreeContext();
		const pathname = usePathname();
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RendererContext, {
			value: (0, import_react.useMemo)(() => ({
				Folder,
				Item,
				Separator,
				pathname
			}), [
				Folder,
				Item,
				Separator,
				pathname
			]),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: renderList(root.children) }, root.$id)
		});
	};
}
function createLinkItemRenderer({ SidebarFolder, SidebarFolderContent, SidebarFolderLink, SidebarFolderTrigger, SidebarItem }) {
	/**
	* Render sidebar items from page tree
	*/
	return function SidebarLinkItem({ item, ...props }) {
		const active = isLinkItemActive(item, usePathname());
		if (item.type === "custom") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			...props,
			children: item.children
		});
		if (item.type === "menu") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarFolder, {
			...props,
			children: [item.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarFolderLink, {
				href: item.url,
				active,
				external: item.external,
				children: [item.icon, item.text]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarFolderTrigger, { children: [item.icon, item.text] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarFolderContent, { children: item.items.map((child, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarLinkItem, { item: child }, i)) })]
		});
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarItem, {
			href: item.url,
			icon: item.icon,
			external: item.external,
			active,
			...props,
			children: item.text
		});
	};
}
var itemVariants = cva("relative flex flex-row items-center gap-2 rounded-lg p-2 text-start text-fd-muted-foreground wrap-anywhere [&_svg]:size-4 [&_svg]:shrink-0", { variants: {
	variant: {
		link: "transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary data-[active=true]:hover:transition-colors",
		button: "transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none"
	},
	highlight: { true: "data-[active=true]:before:content-[''] data-[active=true]:before:bg-fd-primary data-[active=true]:before:absolute data-[active=true]:before:w-px data-[active=true]:before:inset-y-2.5 data-[active=true]:before:inset-s-2.5" }
} });
var { useSidebar } = base_exports;
function SidebarProvider(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarProvider$1, { ...props });
}
function Sidebar({ footer, banner, collapsible = true, components, ...rest }) {
	const { menuItems, slots, props: { tabs, nav, tabMode } } = useDocsLayout();
	const iconLinks = menuItems.filter((item) => item.type === "icon");
	const viewport = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarViewport, { children: [menuItems.filter((v) => v.type !== "icon").map((item, i, list) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarLinkItem, {
		item,
		className: twMerge(i === list.length - 1 && "mb-4")
	}, i)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarPageTree, { ...components })] });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarContent, {
		...rest,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-3 p-4 pb-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex",
						children: [
							slots.navTitle && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.navTitle, { className: "inline-flex text-[0.9375rem] items-center gap-2.5 font-medium me-auto" }),
							nav?.children,
							collapsible && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarCollapseTrigger, {
								className: twMerge(buttonVariants({
									color: "ghost",
									size: "icon-sm",
									className: "mb-auto text-fd-muted-foreground"
								})),
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeft, {})
							})
						]
					}),
					slots.searchTrigger && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.searchTrigger.full, { hideIfDisabled: true }),
					tabs.length > 0 && tabMode === "auto" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarTabsDropdown, { tabs }),
					banner
				]
			}),
			viewport,
			(slots.languageSelect || iconLinks.length > 0 || slots.themeSwitch || footer) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col p-4 pt-2",
				children: [
					slots.languageSelect && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(slots.languageSelect.root, {
						variant: "secondary",
						className: "text-fd-muted-foreground text-start justify-start bg-fd-secondary/50 mb-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Languages, { className: "size-4.5" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.languageSelect.text, {}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "ms-auto size-3.5" })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex text-fd-muted-foreground items-center border bg-fd-secondary/50 p-0.5 pe-0 rounded-lg empty:hidden",
						children: [iconLinks.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkItem, {
							item,
							className: twMerge(buttonVariants({
								size: "icon-sm",
								color: "ghost"
							})),
							"aria-label": item.label,
							children: item.icon
						}, i)), slots.themeSwitch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.themeSwitch, { className: "px-1 py-0 border-y-0 border-e-0 rounded-none ms-auto *:rounded-md" })]
					}),
					footer
				]
			})
		]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SidebarDrawer, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-3 p-4 pb-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex text-fd-muted-foreground items-center gap-1.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-1",
							children: iconLinks.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkItem, {
								item,
								className: twMerge(buttonVariants({
									size: "icon-sm",
									color: "ghost",
									className: "p-2"
								})),
								"aria-label": item.label,
								children: item.icon
							}, i))
						}),
						slots.languageSelect && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(slots.languageSelect.root, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Languages, { className: "size-4.5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.languageSelect.text, {})] }),
						slots.themeSwitch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.themeSwitch, { className: "p-0" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarTrigger, {
							className: twMerge(buttonVariants({
								color: "ghost",
								size: "icon-sm",
								className: "p-2"
							})),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeft, {})
						})
					]
				}),
				tabs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarTabsDropdown, { tabs }),
				banner
			]
		}),
		viewport,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-col border-t p-4 pt-2 empty:hidden",
			children: footer
		})
	] })] });
}
function SidebarFolder(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarFolder$1, { ...props });
}
function SidebarCollapseTrigger(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarCollapseTrigger$1, { ...props });
}
function SidebarTrigger(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarTrigger$1, { ...props });
}
function SidebarContent({ ref: refProp, className, children, ...props }) {
	const ref = (0, import_react.useRef)(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarContent$1, { children: ({ collapsed, hovered, ref: asideRef, ...rest }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		"data-sidebar-placeholder": "",
		className: "sticky top-(--fd-docs-row-1) z-20 [grid-area:sidebar] pointer-events-none *:pointer-events-auto h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] md:layout:[--fd-sidebar-width:268px] max-md:hidden",
		children: [collapsed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "absolute inset-s-0 inset-y-0 w-4",
			...rest
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
			id: "nd-sidebar",
			ref: mergeRefs$1(ref, refProp, asideRef),
			"data-collapsed": collapsed,
			"data-hovered": collapsed && hovered,
			className: twMerge("absolute flex flex-col w-full inset-s-0 inset-y-0 items-end bg-fd-card text-sm border-e duration-250 *:w-(--fd-sidebar-width)", collapsed && ["inset-y-2 rounded-xl transition-transform border w-(--fd-sidebar-width)", hovered ? "shadow-lg translate-x-2 rtl:-translate-x-2" : "-translate-x-(--fd-sidebar-width) rtl:translate-x-full"], ref.current && ref.current.getAttribute("data-collapsed") === "true" !== collapsed && "transition-[width,inset-block,translate,background-color]", className),
			...props,
			...rest,
			children
		})]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		"data-sidebar-panel": "",
		className: twMerge("fixed flex top-[calc(--spacing(4)+var(--fd-docs-row-3))] inset-s-4 shadow-lg transition-opacity rounded-xl p-0.5 border bg-fd-muted text-fd-muted-foreground z-10", (!collapsed || hovered) && "pointer-events-none opacity-0"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarCollapseTrigger$1, {
			className: twMerge(buttonVariants({
				color: "ghost",
				size: "icon-sm",
				className: "rounded-lg"
			})),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeft, {})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchTrigger, {
			className: "rounded-lg",
			hideIfDisabled: true
		})]
	})] }) });
}
function SidebarDrawer({ children, className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarDrawerOverlay, { className: "fixed z-40 inset-0 backdrop-blur-xs data-[state=open]:animate-fd-fade-in data-[state=closed]:animate-fd-fade-out" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarDrawerContent, {
		className: twMerge("fixed text-[0.9375rem] flex flex-col shadow-lg border-s inset-e-0 inset-y-0 w-[85%] max-w-[380px] z-40 bg-fd-background data-[state=open]:animate-fd-sidebar-in data-[state=closed]:animate-fd-sidebar-out", className),
		...props,
		children
	})] });
}
function SidebarSeparator({ className, style, children, ...props }) {
	const depth = useFolderDepth();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarSeparator$1, {
		className: twMerge("inline-flex items-center gap-2 mb-1 px-2 mt-6 empty:mb-0 [&_svg]:size-4 [&_svg]:shrink-0", depth === 0 && "first:mt-0", className),
		style: {
			paddingInlineStart: getItemOffset(depth),
			...style
		},
		...props,
		children
	});
}
function SidebarItem({ className, style, children, ...props }) {
	const depth = useFolderDepth();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarItem$1, {
		className: twMerge(itemVariants({
			variant: "link",
			highlight: depth >= 1
		}), className),
		style: {
			paddingInlineStart: getItemOffset(depth),
			...style
		},
		...props,
		children
	});
}
function SidebarFolderTrigger({ className, style, ...props }) {
	const { depth, collapsible } = useFolder();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarFolderTrigger$1, {
		className: twMerge(itemVariants({ variant: collapsible ? "button" : null }), "w-full", className),
		style: {
			paddingInlineStart: getItemOffset(depth - 1),
			...style
		},
		...props,
		children: props.children
	});
}
function SidebarFolderLink({ className, style, ...props }) {
	const depth = useFolderDepth();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarFolderLink$1, {
		className: twMerge(itemVariants({
			variant: "link",
			highlight: depth > 1
		}), "w-full", className),
		style: {
			paddingInlineStart: getItemOffset(depth - 1),
			...style
		},
		...props,
		children: props.children
	});
}
function SidebarFolderContent({ className, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarFolderContent$1, {
		className: twMerge("relative", useFolderDepth() === 1 && "before:content-[''] before:absolute before:w-px before:inset-y-1 before:bg-fd-border before:inset-s-2.5", className),
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-col gap-0.5 pt-0.5",
			children
		})
	});
}
function SidebarTabsDropdown({ tabs, placeholder, ...props }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const { closeOnRedirect } = useSidebar();
	const pathname = usePathname();
	const selected = (0, import_react.useMemo)(() => {
		return tabs.findLast((item) => isLayoutTabActive(item, pathname));
	}, [tabs, pathname]);
	const onClick = () => {
		closeOnRedirect.current = false;
		setOpen(false);
	};
	const item = selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "size-9 shrink-0 empty:hidden md:size-5",
		children: selected.icon
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-sm font-medium",
		children: selected.title
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-sm text-fd-muted-foreground empty:hidden md:hidden",
		children: selected.description
	})] })] }) : placeholder;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open,
		onOpenChange: setOpen,
		children: [item && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverTrigger, {
			...props,
			className: twMerge("flex items-center gap-2 rounded-lg p-2 border bg-fd-secondary/50 text-start text-fd-secondary-foreground transition-colors hover:bg-fd-accent data-[state=open]:bg-fd-accent data-[state=open]:text-fd-accent-foreground", props.className),
			children: [item, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronsUpDown, { className: "shrink-0 ms-auto size-4 text-fd-muted-foreground" })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
			className: "flex flex-col gap-1 w-(--radix-popover-trigger-width) p-1 fd-scroll-container",
			children: tabs.map((item) => {
				const isActive = selected && item.url === selected.url;
				if (!isActive && item.unlisted) return;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link$1, {
					href: item.url,
					onClick,
					...item.props,
					className: twMerge("flex items-center gap-2 rounded-lg p-1.5 hover:bg-fd-accent hover:text-fd-accent-foreground", item.props?.className),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "shrink-0 size-9 md:mb-auto md:size-5 empty:hidden",
							children: item.icon
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm font-medium leading-none",
							children: item.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[0.8125rem] text-fd-muted-foreground mt-1 empty:hidden",
							children: item.description
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: twMerge("shrink-0 ms-auto size-3.5 text-fd-primary", !isActive && "invisible") })
					]
				}, item.url);
			})
		})]
	});
}
function getItemOffset(depth) {
	return `calc(${2 + 3 * depth} * var(--spacing))`;
}
var SidebarPageTree = createPageTreeRenderer({
	SidebarFolder,
	SidebarFolderContent,
	SidebarFolderLink,
	SidebarFolderTrigger,
	SidebarItem,
	SidebarSeparator
});
var SidebarLinkItem = createLinkItemRenderer({
	SidebarFolder,
	SidebarFolderContent,
	SidebarFolderLink,
	SidebarFolderTrigger,
	SidebarItem
});
function Header(props) {
	const { isNavTransparent, slots, props: { nav } } = useDocsLayout();
	if (nav?.component) return nav.component;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		id: "nd-subnav",
		"data-transparent": isNavTransparent,
		...props,
		className: twMerge("[grid-area:header] sticky top-(--fd-docs-row-1) z-30 flex items-center ps-4 pe-2.5 border-b transition-colors backdrop-blur-sm h-(--fd-header-height) md:hidden max-md:layout:[--fd-header-height:--spacing(14)] data-[transparent=false]:bg-fd-background/80", props.className),
		children: [
			slots.navTitle && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.navTitle, { className: "inline-flex items-center gap-2.5 font-semibold" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex-1",
				children: nav?.children
			}),
			slots.searchTrigger && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.searchTrigger.sm, {
				hideIfDisabled: true,
				className: "p-2"
			}),
			slots.sidebar && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.sidebar.trigger, {
				className: twMerge(buttonVariants({
					color: "ghost",
					size: "icon-sm",
					className: "p-2"
				})),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeft, {})
			})
		]
	});
}
function DocsLayout({ tree, sidebar: { tabs: _tabs, tabMode: _tabMode, ...sidebarProps } = {}, tabs: layoutTabs = _tabs, tabMode = _tabMode, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LayoutBody, {
		tree,
		tabs: (0, import_react.useMemo)(() => {
			if (Array.isArray(layoutTabs)) return layoutTabs;
			if (typeof layoutTabs === "object") return getLayoutTabs(tree, layoutTabs);
			if (layoutTabs !== false) return getLayoutTabs(tree);
			return [];
		}, [tree, layoutTabs]),
		tabMode,
		sidebar: sidebarProps,
		...props,
		children
	});
}
function Container$1(props) {
	const { slots } = useDocsLayout();
	const { collapsed } = slots.sidebar.useSidebar();
	const [previousCollapsed, setPreviousCollapsed] = (0, import_react.useState)(collapsed);
	const isCollapseChanged = previousCollapsed !== collapsed;
	(0, import_react.useEffect)(() => {
		if (isCollapseChanged) setPreviousCollapsed(collapsed);
	}, [collapsed, isCollapseChanged]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		id: "nd-docs-layout",
		"data-sidebar-collapsed": collapsed,
		"data-column-changed": isCollapseChanged,
		...props,
		style: {
			gridTemplate: `"sidebar sidebar header toc toc"
"sidebar sidebar toc-popover toc toc"
"sidebar sidebar main toc toc" 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,97rem) - var(--fd-sidebar-width) - var(--fd-toc-width))) var(--fd-toc-width) minmax(min-content, 1fr)`,
			"--fd-docs-row-1": "var(--fd-banner-height, 0px)",
			"--fd-docs-row-2": "calc(var(--fd-docs-row-1) + var(--fd-header-height))",
			"--fd-docs-row-3": "calc(var(--fd-docs-row-2) + var(--fd-toc-popover-height))",
			"--fd-sidebar-col": collapsed ? "0px" : "var(--fd-sidebar-width)",
			...props.style
		},
		className: twMerge("grid overflow-x-clip min-h-(--fd-docs-height) [--fd-docs-height:100dvh] [--fd-header-height:0px] [--fd-toc-popover-height:0px] [--fd-sidebar-width:0px] [--fd-toc-width:0px] data-[column-changed=true]:transition-[grid-template-columns]", props.className),
		children: props.children
	});
}
var { useProvider } = baseSlots({ useProps() {
	return useDocsLayout().props;
} });
var LayoutContext = (0, import_react.createContext)(null);
function useDocsLayout() {
	const context = (0, import_react.use)(LayoutContext);
	if (!context) throw new Error("Please use <DocsPage /> (`fumadocs-ui/layouts/docs/page`) under <DocsLayout /> (`fumadocs-ui/layouts/docs`).");
	return context;
}
function LayoutBody(props) {
	const { nav: { enabled: navEnabled = true, transparentMode: navTransparentMode = "none" } = {}, sidebar: { enabled: sidebarEnabled = true, defaultOpenLevel, prefetch, ...sidebarProps } = {}, slots: defaultSlots, tabs, tabMode = "auto", tree, containerProps, children } = props;
	const isTop = useIsScrollTop({ enabled: navTransparentMode === "top" }) ?? true;
	const isNavTransparent = navTransparentMode === "top" ? isTop : navTransparentMode === "always";
	const { baseSlots, baseProps } = useProvider(props);
	const linkItems = useLinkItems(props);
	const slots = {
		...baseSlots,
		header: defaultSlots?.header ?? Header,
		container: defaultSlots?.container ?? Container$1,
		sidebar: defaultSlots?.sidebar ?? {
			provider: SidebarProvider,
			root: Sidebar,
			trigger: SidebarTrigger,
			useSidebar
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeContextProvider, {
		tree,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LayoutContext, {
			value: {
				props: {
					tabMode,
					tabs,
					...baseProps
				},
				isNavTransparent,
				slots,
				...linkItems
			},
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.sidebar.provider, {
				defaultOpenLevel,
				prefetch,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(slots.container, {
					...containerProps,
					children: [
						navEnabled && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.header, {}),
						sidebarEnabled && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.sidebar.root, { ...sidebarProps }),
						tabMode === "top" && tabs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LayoutTabs, {
							tabs,
							className: "z-10 bg-fd-background border-b px-6 pt-3 xl:px-8 max-md:hidden"
						}),
						children
					]
				})
			})
		})
	});
}
function LayoutTabs({ tabs, ...props }) {
	const pathname = usePathname();
	const selected = (0, import_react.useMemo)(() => {
		return tabs.findLast((option) => isLayoutTabActive(option, pathname));
	}, [tabs, pathname]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		className: twMerge("flex flex-row items-end gap-6 overflow-auto [grid-area:main]", props.className),
		children: tabs.map((tab, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link$1, {
			href: tab.url,
			className: twMerge("inline-flex border-b-2 border-transparent transition-colors items-center pb-1.5 font-medium gap-2 text-fd-muted-foreground text-sm text-nowrap hover:text-fd-accent-foreground", tab.unlisted && selected !== tab && "hidden", selected === tab && "border-fd-primary text-fd-primary"),
			children: tab.title
		}, i))
	});
}
function TOCProvider(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCProvider$1, { ...props });
}
function TOC({ container, header, footer, style = "normal", list }) {
	const items = useTOCItems();
	const { TOCItems, TOCEmpty, TOCItem } = style === "clerk" ? clerk_exports : default_exports;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		id: "nd-toc",
		...container,
		className: twMerge("sticky top-(--fd-docs-row-1) h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] flex flex-col [grid-area:toc] w-(--fd-toc-width) pt-12 pe-4 pb-2 xl:layout:[--fd-toc-width:268px] max-xl:hidden", container?.className),
		children: [
			header,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
				id: "toc-title",
				className: "inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { className: "size-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(I18nLabel, { label: "toc" })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCScrollArea, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TOCItems, {
				...list,
				children: [items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCEmpty, {}), items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCItem, { item }, item.url))]
			}) }),
			footer
		]
	});
}
var TocPopoverContext = (0, import_react.createContext)(null);
function TOCPopover({ container, trigger, content, header, footer, style = "normal", list }) {
	const items = useTOCItems();
	const ref = (0, import_react.useRef)(null);
	const [open, setOpen] = (0, import_react.useState)(false);
	const { isNavTransparent } = useDocsLayout();
	const { TOCItems, TOCItem, TOCEmpty } = style === "clerk" ? clerk_exports : default_exports;
	const onClickOutside = (0, import_react.useEffectEvent)((e) => {
		if (!open || !(e.target instanceof HTMLElement)) return;
		if (ref.current && !ref.current.contains(e.target)) setOpen(false);
	});
	const onClickItem = () => {
		setOpen(false);
	};
	(0, import_react.useEffect)(() => {
		window.addEventListener("click", onClickOutside);
		return () => {
			window.removeEventListener("click", onClickOutside);
		};
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TocPopoverContext, {
		value: (0, import_react.useMemo)(() => ({
			open,
			setOpen
		}), [setOpen, open]),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Collapsible, {
			open,
			onOpenChange: setOpen,
			"data-toc-popover": "",
			...container,
			className: twMerge("sticky top-(--fd-docs-row-2) z-10 [grid-area:toc-popover] h-(--fd-toc-popover-height) xl:hidden max-xl:layout:[--fd-toc-popover-height:--spacing(10)]", container?.className),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				ref,
				className: twMerge("border-b backdrop-blur-sm transition-colors", (!isNavTransparent || open) && "bg-fd-background/80", open && "shadow-lg"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageTOCPopoverTrigger, { ...trigger }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageTOCPopoverContent, {
					...content,
					children: [
						header,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCScrollArea, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TOCItems, {
							...list,
							children: [items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCEmpty, {}), items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TOCItem, {
								item,
								onClick: onClickItem
							}, item.url))]
						}) }),
						footer
					]
				})]
			})
		})
	});
}
function PageTOCPopoverTrigger({ className, ...props }) {
	const { text } = useI18n();
	const { open } = (0, import_react.use)(TocPopoverContext);
	const items = useItems();
	const selectedIdx = items.findIndex((item) => item.active);
	const path = useTreePath().at(-1);
	const showItem = selectedIdx !== -1 && !open;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CollapsibleTrigger, {
		className: twMerge("flex w-full h-10 items-center text-sm text-fd-muted-foreground gap-2.5 px-4 py-2.5 text-start focus-visible:outline-none [&_svg]:size-4 md:px-6", className),
		"data-toc-popover-trigger": "",
		...props,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProgressCircle, {
				value: (items.findLastIndex((item) => item.active) + 1) / Math.max(1, items.length),
				max: 1,
				className: twMerge("shrink-0", open && "text-fd-primary")
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "grid flex-1 *:my-auto *:row-start-1 *:col-start-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: twMerge("truncate transition-[opacity,translate,color]", open && "text-fd-foreground", showItem && "opacity-0 -translate-y-full pointer-events-none"),
					children: path?.name ?? text.toc
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: twMerge("truncate transition-[opacity,translate]", !showItem && "opacity-0 translate-y-full pointer-events-none"),
					children: items[selectedIdx]?.original.title
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: twMerge("shrink-0 transition-transform mx-0.5", open && "rotate-180") })
		]
	});
}
function clamp(input, min, max) {
	if (input < min) return min;
	if (input > max) return max;
	return input;
}
function ProgressCircle({ value, strokeWidth = 1.5, size = 18, min = 0, max = 100, style, ...restSvgProps }) {
	const normalizedValue = clamp(value, min, max);
	const radius = size / 2 - strokeWidth;
	const circumference = 2 * Math.PI * radius;
	const progress = normalizedValue / max * circumference;
	const circleProps = {
		cx: size / 2,
		cy: size / 2,
		r: radius,
		fill: "none",
		strokeWidth
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		role: "progressbar",
		viewBox: `0 0 ${size} ${size}`,
		"aria-valuenow": normalizedValue,
		"aria-valuemin": min,
		"aria-valuemax": max,
		style: {
			width: size,
			height: size,
			...style
		},
		...restSvgProps,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			...circleProps,
			className: "stroke-current/25"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			...circleProps,
			stroke: "currentColor",
			strokeDasharray: circumference,
			strokeDashoffset: circumference - progress,
			strokeLinecap: "round",
			transform: `rotate(-90 ${size / 2} ${size / 2})`,
			className: "transition-all"
		})]
	});
}
function PageTOCPopoverContent(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollapsibleContent, {
		"data-toc-popover-content": "",
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex flex-col px-4 max-h-[50vh] md:px-6",
			children: props.children
		})
	});
}
var footerCache = /* @__PURE__ */ new WeakMap();
/**
* @returns a list of page tree items (linear), that you can obtain footer items
*/
function useFooterItems() {
	const { root } = useTreeContext();
	const cached = footerCache.get(root);
	if (cached) return cached;
	const list = [];
	function onNode(node) {
		if (node.type === "folder") {
			if (node.index) onNode(node.index);
			for (const child of node.children) onNode(child);
		} else if (node.type === "page" && !node.external) list.push(node);
	}
	for (const child of root.children) onNode(child);
	footerCache.set(root, list);
	return list;
}
function Footer({ items, children, className, ...props }) {
	const footerList = useFooterItems();
	const pathname = usePathname();
	const { previous, next } = (0, import_react.useMemo)(() => {
		if (items) return items;
		const idx = footerList.findIndex((item) => isActive(item.url, pathname));
		if (idx === -1) return {};
		return {
			previous: footerList[idx - 1],
			next: footerList[idx + 1]
		};
	}, [
		footerList,
		items,
		pathname
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: twMerge("@container grid gap-4", previous && next ? "grid-cols-2" : "grid-cols-1", className),
		...props,
		children: [previous && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FooterItem, {
			item: previous,
			index: 0
		}), next && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FooterItem, {
			item: next,
			index: 1
		})]
	}), children] });
}
function FooterItem({ item, index }) {
	const { text } = useI18n();
	const Icon = index === 0 ? ChevronLeft : ChevronRight;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link$1, {
		href: item.url,
		className: twMerge("flex flex-col gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-fd-accent/80 hover:text-fd-accent-foreground @max-lg:col-span-full", index === 1 && "text-end"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: twMerge("inline-flex items-center gap-1.5 font-medium", index === 1 && "flex-row-reverse"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "-mx-1 size-4 shrink-0 rtl:rotate-180" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.name })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-fd-muted-foreground truncate",
			children: item.description ?? (index === 0 ? text.previousPage : text.nextPage)
		})]
	});
}
function Breadcrumb({ includeRoot, includeSeparator, includePage, ...props }) {
	const path = useTreePath();
	const { root } = useTreeContext();
	const items = (0, import_react.useMemo)(() => {
		return getBreadcrumbItemsFromPath(root, path, {
			includePage,
			includeSeparator,
			includeRoot
		});
	}, [
		includePage,
		includeRoot,
		includeSeparator,
		path,
		root
	]);
	if (items.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		className: twMerge("flex items-center gap-1.5 text-sm text-fd-muted-foreground", props.className),
		children: items.map((item, i) => {
			const className = twMerge("truncate", i === items.length - 1 && "text-fd-primary font-medium");
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [i !== 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "size-3.5 shrink-0" }), item.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link$1, {
				href: item.url,
				className: twMerge(className, "transition-opacity hover:opacity-80"),
				children: item.name
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className,
				children: item.name
			})] }, i);
		})
	});
}
function Container(props) {
	const { props: { full } } = useDocsPage();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("article", {
		id: "nd-page",
		"data-full": full,
		...props,
		className: twMerge("flex flex-col w-full max-w-[900px] mx-auto [grid-area:main] px-4 py-6 gap-4 md:px-6 md:pt-8 xl:px-8 xl:pt-14", full && "max-w-[1168px]", props.className),
		children: props.children
	});
}
function useCopyButton(onCopy) {
	const [checked, setChecked] = (0, import_react.useState)(false);
	const callbackRef = (0, import_react.useRef)(onCopy);
	const timeoutRef = (0, import_react.useRef)(null);
	callbackRef.current = onCopy;
	const onClick = (0, import_react.useCallback)(() => {
		if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
		Promise.resolve(callbackRef.current()).then(() => {
			setChecked(true);
			timeoutRef.current = window.setTimeout(() => {
				setChecked(false);
			}, 1500);
		});
	}, []);
	(0, import_react.useEffect)(() => {
		return () => {
			if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
		};
	}, []);
	return [checked, onClick];
}
var cache = /* @__PURE__ */ new Map();
/**
* see https://fumadocs.dev/docs/integrations/llms#page-actions to customize.
*/
function MarkdownCopyButton({ markdownUrl, ...props }) {
	const [isLoading, setLoading] = (0, import_react.useState)(false);
	const [checked, onClick] = useCopyButton(async () => {
		const cached = cache.get(markdownUrl);
		if (cached) return navigator.clipboard.writeText(await cached);
		setLoading(true);
		try {
			const promise = fetch(markdownUrl).then((res) => res.text());
			cache.set(markdownUrl, promise);
			await navigator.clipboard.write([new ClipboardItem({ "text/plain": promise })]);
		} finally {
			setLoading(false);
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		disabled: isLoading,
		onClick,
		...props,
		className: twMerge(buttonVariants({
			color: "secondary",
			size: "sm",
			className: "gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground"
		}), props.className),
		children: [checked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, {}), props.children ?? "Copy Markdown"]
	});
}
/**
* see https://fumadocs.dev/docs/integrations/llms#page-actions to customize.
*/
function ViewOptionsPopover({ markdownUrl, githubUrl, ...props }) {
	const pathname = usePathname();
	const items = (0, import_react.useMemo)(() => {
		const q = `Read ${typeof window === "undefined" ? pathname : new URL(pathname, window.location.origin)}, I want to ask questions about it.`;
		return [
			githubUrl && {
				title: "Open in GitHub",
				href: githubUrl,
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
					fill: "currentColor",
					role: "img",
					viewBox: "0 0 24 24",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("title", { children: "GitHub" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" })]
				})
			},
			markdownUrl && {
				title: "View as Markdown",
				href: markdownUrl,
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, {})
			},
			{
				title: "Open in Scira AI",
				href: `https://scira.ai/?${new URLSearchParams({ q })}`,
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
					width: "910",
					height: "934",
					viewBox: "0 0 910 934",
					fill: "none",
					xmlns: "http://www.w3.org/2000/svg",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("title", { children: "Scira AI" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M647.664 197.775C569.13 189.049 525.5 145.419 516.774 66.8849C508.048 145.419 464.418 189.049 385.884 197.775C464.418 206.501 508.048 250.131 516.774 328.665C525.5 250.131 569.13 206.501 647.664 197.775Z",
							fill: "currentColor",
							stroke: "currentColor",
							strokeWidth: "8",
							strokeLinejoin: "round"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M516.774 304.217C510.299 275.491 498.208 252.087 480.335 234.214C462.462 216.341 439.058 204.251 410.333 197.775C439.059 191.3 462.462 179.209 480.335 161.336C498.208 143.463 510.299 120.06 516.774 91.334C523.25 120.059 535.34 143.463 553.213 161.336C571.086 179.209 594.49 191.3 623.216 197.775C594.49 204.251 571.086 216.341 553.213 234.214C535.34 252.087 523.25 275.491 516.774 304.217Z",
							fill: "currentColor",
							stroke: "currentColor",
							strokeWidth: "8",
							strokeLinejoin: "round"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M857.5 508.116C763.259 497.644 710.903 445.288 700.432 351.047C689.961 445.288 637.605 497.644 543.364 508.116C637.605 518.587 689.961 570.943 700.432 665.184C710.903 570.943 763.259 518.587 857.5 508.116Z",
							stroke: "currentColor",
							strokeWidth: "20",
							strokeLinejoin: "round"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M700.432 615.957C691.848 589.05 678.575 566.357 660.383 548.165C642.191 529.973 619.499 516.7 592.593 508.116C619.499 499.533 642.191 486.258 660.383 468.066C678.575 449.874 691.848 427.181 700.432 400.274C709.015 427.181 722.289 449.874 740.481 468.066C758.673 486.258 781.365 499.533 808.271 508.116C781.365 516.7 758.673 529.973 740.481 548.165C722.289 566.357 709.015 589.05 700.432 615.957Z",
							stroke: "currentColor",
							strokeWidth: "20",
							strokeLinejoin: "round"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M889.949 121.237C831.049 114.692 798.326 81.9698 791.782 23.0692C785.237 81.9698 752.515 114.692 693.614 121.237C752.515 127.781 785.237 160.504 791.782 219.404C798.326 160.504 831.049 127.781 889.949 121.237Z",
							fill: "currentColor",
							stroke: "currentColor",
							strokeWidth: "8",
							strokeLinejoin: "round"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M791.782 196.795C786.697 176.937 777.869 160.567 765.16 147.858C752.452 135.15 736.082 126.322 716.226 121.237C736.082 116.152 752.452 107.324 765.16 94.6152C777.869 81.9065 786.697 65.5368 791.782 45.6797C796.867 65.5367 805.695 81.9066 818.403 94.6152C831.112 107.324 847.481 116.152 867.338 121.237C847.481 126.322 831.112 135.15 818.403 147.858C805.694 160.567 796.867 176.937 791.782 196.795Z",
							fill: "currentColor",
							stroke: "currentColor",
							strokeWidth: "8",
							strokeLinejoin: "round"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M760.632 764.337C720.719 814.616 669.835 855.1 611.872 882.692C553.91 910.285 490.404 924.255 426.213 923.533C362.022 922.812 298.846 907.419 241.518 878.531C184.19 849.643 134.228 808.026 95.4548 756.863C56.6815 705.7 30.1238 646.346 17.8129 583.343C5.50207 520.339 7.76433 455.354 24.4266 393.359C41.089 331.364 71.7099 274.001 113.947 225.658C156.184 177.315 208.919 139.273 268.117 114.442",
							stroke: "currentColor",
							strokeWidth: "30",
							strokeLinecap: "round",
							strokeLinejoin: "round"
						})
					]
				})
			},
			{
				title: "Open in ChatGPT",
				href: `https://chatgpt.com/?${new URLSearchParams({
					hints: "search",
					q
				})}`,
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
					role: "img",
					viewBox: "0 0 24 24",
					fill: "currentColor",
					xmlns: "http://www.w3.org/2000/svg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("title", { children: "OpenAI" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" })]
				})
			},
			{
				title: "Open in Claude",
				href: `https://claude.ai/new?${new URLSearchParams({ q })}`,
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
					fill: "currentColor",
					role: "img",
					viewBox: "0 0 24 24",
					xmlns: "http://www.w3.org/2000/svg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("title", { children: "Anthropic" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" })]
				})
			},
			{
				title: "Open in Cursor",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
					fill: "currentColor",
					role: "img",
					viewBox: "0 0 24 24",
					xmlns: "http://www.w3.org/2000/svg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("title", { children: "Cursor" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" })]
				}),
				href: `https://cursor.com/link/prompt?${new URLSearchParams({ text: q })}`
			}
		].filter((v) => !!v);
	}, [
		githubUrl,
		markdownUrl,
		pathname
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverTrigger, {
		...props,
		className: twMerge(buttonVariants({
			color: "secondary",
			size: "sm"
		}), "gap-2 data-[state=open]:bg-fd-accent data-[state=open]:text-fd-accent-foreground", props.className),
		children: [props.children ?? "Open", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "size-3.5 text-fd-muted-foreground" })]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
		className: "flex flex-col",
		children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
			href: item.href,
			rel: "noreferrer noopener",
			target: "_blank",
			className: "text-sm p-2 rounded-lg inline-flex items-center gap-2 hover:text-fd-accent-foreground hover:bg-fd-accent [&_svg]:size-4",
			children: [
				item.icon,
				item.title,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, { className: "text-fd-muted-foreground size-3.5 ms-auto" })
			]
		}, item.href))
	})] });
}
var PageContext = (0, import_react.createContext)(null);
function useDocsPage() {
	const context = (0, import_react.use)(PageContext);
	if (!context) throw new Error("Please use page components under <DocsPage /> (`fumadocs-ui/layouts/docs/page`).");
	return context;
}
function DocsPage({ tableOfContent: { enabled: tocEnabled, single, ...tocProps } = {}, tableOfContentPopover: { enabled: tocPopoverEnabled, ...tocPopoverProps } = {}, breadcrumb: { enabled: breadcrumbEnabled = true, ...breadcrumb } = {}, footer: { enabled: footerEnabled = true, ...footer } = {}, full = false, toc = [], slots: defaultSlots = {}, children, ...containerProps }) {
	tocEnabled ??= Boolean(!full && (toc.length > 0 || tocProps.footer || tocProps.header));
	tocPopoverEnabled ??= Boolean(toc.length > 0 || tocPopoverProps.header || tocPopoverProps.footer);
	const slots = {
		breadcrumb: defaultSlots.breadcrumb ?? Breadcrumb,
		footer: defaultSlots.footer ?? Footer,
		toc: defaultSlots.toc ?? {
			provider: TOCProvider,
			main: TOC,
			popover: TOCPopover
		},
		container: defaultSlots.container ?? Container
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageContext, {
		value: {
			props: { full },
			slots
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(slots.toc.provider, {
			single,
			toc: tocEnabled || tocPopoverEnabled ? toc : [],
			children: [
				tocPopoverEnabled && (tocPopoverProps.component ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.toc.popover, { ...tocPopoverProps })),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(slots.container, {
					...containerProps,
					children: [
						breadcrumbEnabled && (breadcrumb.component ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.breadcrumb, { ...breadcrumb })),
						children,
						footerEnabled && (footer.component ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.footer, { ...footer }))
					]
				}),
				tocEnabled && (tocProps.component ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.toc.main, { ...tocProps }))
			]
		})
	});
}
/**
* Add typography styles
*/
function DocsBody({ children, className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		className: twMerge("prose flex-1", className),
		children
	});
}
function DocsDescription({ children, className, ...props }) {
	if (children === void 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		...props,
		className: twMerge("mb-8 text-lg text-fd-muted-foreground", className),
		children
	});
}
function DocsTitle({ children, className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
		...props,
		className: twMerge("text-[1.75em] font-semibold", className),
		children
	});
}
function Cards(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		...props,
		className: twMerge("grid grid-cols-2 gap-3 @container", props.className),
		children: props.children
	});
}
function Card({ icon, title, description, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(props.href ? Link$1 : "div", {
		...props,
		"data-card": true,
		className: twMerge("block rounded-xl border bg-fd-card p-4 text-fd-card-foreground transition-colors @max-lg:col-span-full", props.href && "hover:bg-fd-accent/80", props.className),
		children: [
			icon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "not-prose mb-2 w-fit shadow-md rounded-lg border bg-fd-muted p-1.5 text-fd-muted-foreground [&_svg]:size-4",
				children: icon
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "not-prose mb-1 text-sm font-medium",
				children: title
			}),
			description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "my-0! text-sm text-fd-muted-foreground",
				children: description
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-sm text-fd-muted-foreground prose-no-margin empty:hidden",
				children: props.children
			})
		]
	});
}
var iconClass = "size-5 -me-0.5 fill-(--callout-color) text-fd-card";
function Callout({ children, title, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CalloutContainer, {
		...props,
		children: [title && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalloutTitle, { children: title }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalloutDescription, { children })]
	});
}
function resolveAlias(type) {
	if (type === "warn") return "warning";
	if (type === "tip") return "info";
	return type;
}
function CalloutContainer({ type: inputType = "info", icon, children, className, style, ...props }) {
	const type = resolveAlias(inputType);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: twMerge("flex gap-2 my-4 rounded-xl border bg-fd-card p-3 ps-1 text-sm text-fd-card-foreground shadow-md", className),
		style: {
			"--callout-color": `var(--color-fd-${type}, var(--color-fd-muted))`,
			...style
		},
		...props,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "none",
				className: "w-0.5 bg-(--callout-color)/50 rounded-sm"
			}),
			icon ?? {
				info: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, { className: iconClass }),
				warning: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: iconClass }),
				error: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleX, { className: iconClass }),
				success: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: iconClass }),
				idea: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lightbulb, { className: "size-5 -me-0.5 fill-(--callout-color) text-(--callout-color)" })
			}[type],
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-col gap-2 min-w-0 flex-1",
				children
			})
		]
	});
}
function CalloutTitle({ children, className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: twMerge("font-medium my-0!", className),
		...props,
		children
	});
}
function CalloutDescription({ children, className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: twMerge("text-fd-muted-foreground prose-no-margin empty:hidden", className),
		...props,
		children
	});
}
function Heading({ as, ...props }) {
	const As = as ?? "h1";
	const [isChecked, onCopy] = useCopyButton(() => {
		if (!props.id) return;
		const url = new URL(window.location.href);
		url.hash = props.id;
		return navigator.clipboard.writeText(url.href);
	});
	if (!props.id) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(As, { ...props });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(As, {
		...props,
		className: twMerge("group/heading flex scroll-m-28 flex-row items-center gap-1", props.className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
			"data-card": "",
			href: `#${props.id}`,
			children: props.children
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			"aria-label": "Copy Anchor Link",
			className: twMerge(buttonVariants({
				variant: "ghost",
				size: "icon-xs"
			}), "not-prose shrink-0 text-fd-muted-foreground opacity-0 transition-opacity group-hover/heading:opacity-100"),
			onClick: onCopy,
			children: isChecked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyCheck, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {})
		})]
	});
}
var listeners = /* @__PURE__ */ new Map();
var TabsContext$1 = (0, import_react.createContext)(null);
function useTabContext() {
	const ctx = (0, import_react.use)(TabsContext$1);
	if (!ctx) throw new Error("You must wrap your component in <Tabs>");
	return ctx;
}
var TabsList = TabsList$1;
var TabsTrigger = TabsTrigger$1;
function Tabs({ ref, groupId, persist = false, updateAnchor = false, defaultValue, value: _value, onValueChange: _onValueChange, ...props }) {
	const tabsRef = (0, import_react.useRef)(null);
	const valueToIdMap = (0, import_react.useMemo)(() => /* @__PURE__ */ new Map(), []);
	const [value, setValue] = _value === void 0 ? (0, import_react.useState)(defaultValue) : [_value, (0, import_react.useEffectEvent)((v) => _onValueChange?.(v))];
	(0, import_react.useLayoutEffect)(() => {
		if (!groupId) return;
		let previous = sessionStorage.getItem(groupId);
		if (persist) previous ??= localStorage.getItem(groupId);
		if (previous) setValue(previous);
		const groupListeners = listeners.get(groupId) ?? /* @__PURE__ */ new Set();
		groupListeners.add(setValue);
		listeners.set(groupId, groupListeners);
		return () => {
			groupListeners.delete(setValue);
		};
	}, [
		groupId,
		persist,
		setValue
	]);
	(0, import_react.useLayoutEffect)(() => {
		const hash = window.location.hash.slice(1);
		if (!hash) return;
		for (const [value, id] of valueToIdMap.entries()) if (id === hash) {
			setValue(value);
			tabsRef.current?.scrollIntoView();
			break;
		}
	}, [setValue, valueToIdMap]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tabs$1, {
		ref: mergeRefs$1(ref, tabsRef),
		value,
		onValueChange: (v) => {
			if (updateAnchor) {
				const id = valueToIdMap.get(v);
				if (id) window.history.replaceState(null, "", `#${id}`);
			}
			if (groupId) {
				const groupListeners = listeners.get(groupId);
				if (groupListeners) for (const listener of groupListeners) listener(v);
				sessionStorage.setItem(groupId, v);
				if (persist) localStorage.setItem(groupId, v);
			} else setValue(v);
		},
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContext$1, {
			value: (0, import_react.useMemo)(() => ({ valueToIdMap }), [valueToIdMap]),
			children: props.children
		})
	});
}
function TabsContent({ value, ...props }) {
	const { valueToIdMap } = useTabContext();
	if (props.id) valueToIdMap.set(value, props.id);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent$1, {
		value,
		...props,
		children: props.children
	});
}
var TabsContext = (0, import_react.createContext)(null);
function Pre(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
		...props,
		className: twMerge("min-w-full w-max *:flex *:flex-col", props.className),
		children: props.children
	});
}
function CodeBlock({ ref, title, allowCopy = true, keepBackground = false, icon, viewportProps = {}, children, Actions = (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	...props,
	className: twMerge("empty:hidden", props.className)
}), ...props }) {
	const inTab = (0, import_react.use)(TabsContext) !== null;
	const areaRef = (0, import_react.useRef)(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
		ref,
		dir: "ltr",
		...props,
		tabIndex: -1,
		className: twMerge(inTab ? "bg-fd-secondary -mx-px -mb-px last:rounded-b-xl" : "my-4 bg-fd-card rounded-xl", keepBackground && "bg-(--shiki-light-bg) dark:bg-(--shiki-dark-bg)", "shiki relative border shadow-sm not-prose overflow-hidden text-sm", props.className),
		children: [title ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex text-fd-muted-foreground items-center gap-2 h-9.5 border-b px-4",
			children: [
				typeof icon === "string" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "[&_svg]:size-3.5",
					dangerouslySetInnerHTML: { __html: icon }
				}) : icon,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", {
					className: "flex-1 truncate",
					children: title
				}),
				Actions({
					className: "-me-2",
					children: allowCopy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyButton, { containerRef: areaRef })
				})
			]
		}) : Actions({
			className: "absolute top-3 right-2 z-2 backdrop-blur-lg rounded-lg text-fd-muted-foreground",
			children: allowCopy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyButton, { containerRef: areaRef })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			ref: areaRef,
			...viewportProps,
			role: "region",
			tabIndex: 0,
			className: twMerge("text-[0.8125rem] py-3.5 overflow-auto max-h-[600px] fd-scroll-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring", viewportProps.className),
			style: {
				"--padding-right": !title ? "calc(var(--spacing) * 8)" : void 0,
				counterSet: props["data-line-numbers"] ? `line ${Number(props["data-line-numbers-start"] ?? 1) - 1}` : void 0,
				...viewportProps.style
			},
			children
		})]
	});
}
function CopyButton({ className, containerRef, ...props }) {
	const [checked, onClick] = useCopyButton(() => {
		const pre = containerRef.current?.getElementsByTagName("pre").item(0);
		if (!pre) return;
		const clone = pre.cloneNode(true);
		clone.querySelectorAll(".nd-copy-ignore").forEach((node) => {
			node.replaceWith("\n");
		});
		navigator.clipboard.writeText(clone.textContent ?? "");
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		"data-checked": checked || void 0,
		className: twMerge(buttonVariants({
			className: "hover:text-fd-accent-foreground data-checked:text-fd-accent-foreground",
			size: "icon-xs"
		}), className),
		"aria-label": checked ? "Copied Text" : "Copy Text",
		onClick,
		...props,
		children: checked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clipboard, {})
	});
}
function CodeBlockTabs({ ref, ...props }) {
	const containerRef = (0, import_react.useRef)(null);
	const nested = (0, import_react.use)(TabsContext) !== null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tabs, {
		ref: mergeRefs$1(containerRef, ref),
		...props,
		className: twMerge("bg-fd-card rounded-xl border", !nested && "my-4", props.className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContext, {
			value: (0, import_react.useMemo)(() => ({
				containerRef,
				nested
			}), [nested]),
			children: props.children
		})
	});
}
function CodeBlockTabsList(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsList, {
		...props,
		className: twMerge("flex flex-row px-2 overflow-x-auto text-fd-muted-foreground", props.className),
		children: props.children
	});
}
function CodeBlockTabsTrigger({ children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
		...props,
		className: twMerge("relative group inline-flex text-sm font-medium text-nowrap items-center transition-colors gap-2 px-2 py-1.5 hover:text-fd-accent-foreground data-[state=active]:text-fd-primary [&_svg]:size-3.5", props.className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-x-2 bottom-0 h-px group-data-[state=active]:bg-fd-primary" }), children]
	});
}
function CodeBlockTab(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, { ...props });
}
function Image$1(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Image, {
		sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 70vw, 900px",
		...props,
		className: twMerge("rounded-lg", props.className)
	});
}
function Table(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "relative overflow-auto prose-no-margin my-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("table", { ...props })
	});
}
var defaultMdxComponents = {
	CodeBlockTab,
	CodeBlockTabs,
	CodeBlockTabsList,
	CodeBlockTabsTrigger,
	pre: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeBlock, {
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pre, { children: props.children })
	}),
	Card,
	Cards,
	a: Link$1,
	img: Image$1,
	h1: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading, {
		as: "h1",
		...props
	}),
	h2: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading, {
		as: "h2",
		...props
	}),
	h3: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading, {
		as: "h3",
		...props
	}),
	h4: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading, {
		as: "h4",
		...props
	}),
	h5: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading, {
		as: "h5",
		...props
	}),
	h6: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading, {
		as: "h6",
		...props
	}),
	table: Table,
	Callout,
	CalloutContainer,
	CalloutTitle,
	CalloutDescription
};
function getMDXComponents(components) {
	return {
		...defaultMdxComponents,
		...components
	};
}
var useMDXComponents = getMDXComponents;
var clientLoader = browserCollections.docs.createClientLoader({ component({ toc, frontmatter, default: MDX }, { markdownUrl, path }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DocsPage, {
		toc,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DocsTitle, { children: frontmatter.title }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DocsDescription, { children: frontmatter.description }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-row gap-2 items-center border-b -mt-4 pb-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MarkdownCopyButton, { markdownUrl }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ViewOptionsPopover, {
					markdownUrl,
					githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/content/docs/${path}`
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DocsBody, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MDX, { components: useMDXComponents() }) })
		]
	});
} });
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var $$splitComponentImporter = () => import("./_-C_FDAJqY.mjs");
var Route = createFileRoute("/docs/$")({
	component: lazyRouteComponent($$splitComponentImporter, "component"),
	loader: async ({ params }) => {
		const data = await loader({ data: params._splat?.split("/") ?? [] });
		await clientLoader.preload(data.path);
		return data;
	}
});
var loader = createServerFn({ method: "GET" }).inputValidator((slugs) => slugs).middleware([staticFunctionMiddleware]).handler(createSsrRpc("3dffc64eabe29fc8f5f4021f5e1cdf4bfea9319ffba3a59848ead9dcd2fa0308"));
//#endregion
export { SearchProvider as a, clientLoader as c, Route as i, useIsScrollTop as l, Link$1 as n, baseOptions as o, LinkItem as r, baseSlots as s, DocsLayout as t, useLinkItems as u };
