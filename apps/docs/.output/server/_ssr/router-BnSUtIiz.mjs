import { i as __toESM } from "../_runtime.mjs";
import { D as notFound, d as Link, f as useParams, i as useRouterState, l as createFileRoute, n as Scripts, o as createRouter, p as useRouter, r as HeadContent, s as Outlet, u as createRootRoute } from "../_libs/@tanstack/react-router+[...].mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { n as findPath } from "./staticFunctionMiddleware-DKfZ4dwE.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { C as ChevronDown, f as House, u as Languages } from "../_libs/lucide-react.mjs";
import { a as markdownPathToSlugs, i as llms, n as extname, r as getLLMText, s as source, t as basename } from "./source-Ddd-zLGf.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { c as useI18n, o as buttonVariants, r as I18nProvider, t as FrameworkProvider } from "./use-on-change-BlU-csFW.mjs";
import { t as J } from "../_libs/next-themes.mjs";
import { t as DirectionProvider } from "../_libs/radix-ui__react-direction.mjs";
import { a as SearchProvider, i as Route$6, l as useIsScrollTop, n as Link$1, o as baseOptions, r as LinkItem, s as baseSlots, u as useLinkItems } from "../_-Wc-HzvQu.mjs";
import { i as insertMultiple, n as save, o as create } from "../_libs/orama__orama.mjs";
import { n as searchSimple, t as searchAdvanced } from "./advanced-BCAHgGV0-ub9H9D0l.mjs";
import { a as SearchDialogHeader, c as SearchDialogList, f as useDocsSearch, l as SearchDialogOverlay, n as SearchDialogClose, o as SearchDialogIcon, r as SearchDialogContent, s as SearchDialogInput, t as SearchDialog } from "./client-BboDFG0M.mjs";
import { a as Root2, i as NavigationMenuItem$1, n as Link$2, o as Trigger, r as List, s as Viewport, t as Content } from "../_libs/@radix-ui/react-navigation-menu+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-BnSUtIiz.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var app_default = "/assets/app-CYZPb8dm.css";
var DefaultSearchDialog$1 = (0, import_react.lazy)(() => import("./search-default-pDtHmXjg.mjs"));
function RootProvider$1({ children, dir = "ltr", theme = {}, search, i18n }) {
	let body = children;
	if (search?.enabled !== false) body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchProvider, {
		SearchDialog: DefaultSearchDialog$1,
		...search,
		children: body
	});
	if (theme?.enabled !== false) body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(J, {
		attribute: "class",
		defaultTheme: "system",
		enableSystem: true,
		disableTransitionOnChange: true,
		...theme,
		children: body
	});
	if (i18n) body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(I18nProvider, {
		...i18n,
		children: body
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DirectionProvider, {
		dir,
		children: body
	});
}
var framework = {
	Link({ href, prefetch = true, ...props }) {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: href,
			preload: prefetch ? "intent" : false,
			...props,
			children: props.children
		});
	},
	usePathname() {
		const { isLoading, pathname } = useRouterState({ select: (state) => ({
			isLoading: state.isLoading,
			pathname: state.location.pathname
		}) });
		const activePathname = (0, import_react.useRef)(pathname);
		return (0, import_react.useMemo)(() => {
			if (isLoading) return activePathname.current;
			activePathname.current = pathname;
			return pathname;
		}, [isLoading, pathname]);
	},
	useRouter() {
		const router = useRouter();
		return (0, import_react.useMemo)(() => ({
			push(url) {
				router.navigate({ href: url });
			},
			refresh() {
				router.invalidate();
			}
		}), [router]);
	},
	useParams() {
		return useParams({ strict: false });
	}
};
/**
* Fumadocs adapter for Tanstack Router/Start
*/
function TanstackProvider({ children, Link: CustomLink, Image: CustomImage }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FrameworkProvider, {
		...framework,
		Link: CustomLink ?? framework.Link,
		Image: CustomImage ?? framework.Image,
		children
	});
}
function RootProvider({ components, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TanstackProvider, {
		Link: components?.Link,
		Image: components?.Image,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RootProvider$1, {
			...props,
			children: props.children
		})
	});
}
function initOrama() {
	return create({
		schema: { _: "string" },
		language: "english"
	});
}
function DefaultSearchDialog(props) {
	const { locale } = useI18n();
	const { search, setSearch, query } = useDocsSearch({
		type: "static",
		initOrama,
		locale
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SearchDialog, {
		search,
		onSearchChange: setSearch,
		isLoading: query.isLoading,
		...props,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogOverlay, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SearchDialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SearchDialogHeader, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogIcon, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogInput, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogClose, {})
		] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchDialogList, { items: query.data !== "empty" ? query.data : null })] })]
	});
}
var Route$5 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: "Fumadocs on TanStack Start" }
		],
		links: [{
			rel: "stylesheet",
			href: app_default
		}]
	}),
	component: RootComponent
});
function RootComponent() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", {
			className: "flex flex-col min-h-screen",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RootProvider, {
				search: { SearchDialog: DefaultSearchDialog },
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})]
		})]
	});
}
var Route$4 = createFileRoute("/llms.txt")({ server: { handlers: { GET() {
	return new Response(llms(source).index());
} } } });
var Route$3 = createFileRoute("/llms-full.txt")({ server: { handlers: { GET: async () => {
	const scan = source.getPages().map(getLLMText);
	const scanned = await Promise.all(scan);
	return new Response(scanned.join("\n\n"));
} } } });
function Container(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		id: "nd-home-layout",
		...props,
		className: twMerge("flex flex-1 flex-col [--fd-layout-width:1400px]", props.className)
	});
}
var NavigationMenu = Root2;
var NavigationMenuList = List;
function NavigationMenuItem({ className, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuItem$1, {
		className: twMerge("list-none", className),
		...props,
		children
	});
}
function NavigationMenuTrigger({ className, children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trigger, {
		className: twMerge("data-[state=open]:bg-fd-accent/50", className),
		...props,
		children
	});
}
function NavigationMenuContent({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content, {
		className: twMerge("absolute inset-x-0 top-0 overflow-auto fd-scroll-container max-h-[80svh] data-[motion=from-end]:animate-fd-enterFromRight data-[motion=from-start]:animate-fd-enterFromLeft data-[motion=to-end]:animate-fd-exitToRight data-[motion=to-start]:animate-fd-exitToLeft", className),
		...props
	});
}
var NavigationMenuLink = Link$2;
function NavigationMenuViewport({ className, ref, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref,
		className: "flex w-full justify-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Viewport, {
			...props,
			className: twMerge("relative h-(--radix-navigation-menu-viewport-height) w-full origin-[top_center] overflow-hidden transition-[width,height] duration-300 data-[state=closed]:animate-fd-nav-menu-out data-[state=open]:animate-fd-nav-menu-in", className)
		})
	});
}
var navItemVariants = cva("[&_svg]:size-4", {
	variants: { variant: {
		main: "inline-flex items-center gap-1 p-2 text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground data-[active=true]:text-fd-primary",
		button: buttonVariants({
			color: "secondary",
			className: "gap-1.5"
		}),
		icon: buttonVariants({
			color: "ghost",
			size: "icon"
		})
	} },
	defaultVariants: { variant: "main" }
});
function Header(props) {
	const { navItems, menuItems, slots, props: { nav } } = useHomeLayout();
	if (nav?.component) return nav.component;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(HeaderNavigationMenu, {
		transparentMode: nav?.transparentMode,
		...props,
		children: [
			slots.navTitle && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.navTitle, { className: "inline-flex items-center gap-2.5 font-semibold" }),
			nav?.children,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-row items-center gap-2 px-6 max-sm:hidden",
				children: navItems.filter((item) => !isSecondary(item)).map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuLinkItem, {
					item,
					className: "text-sm"
				}, i))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-row items-center justify-end gap-1.5 flex-1 max-lg:hidden",
				children: [
					slots.searchTrigger && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.searchTrigger.full, {
						hideIfDisabled: true,
						className: "w-full rounded-full ps-2.5 max-w-[240px]"
					}),
					slots.themeSwitch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.themeSwitch, {}),
					slots.languageSelect && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.languageSelect.root, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Languages, { className: "size-5" }) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "flex flex-row gap-2 items-center empty:hidden",
						children: navItems.filter(isSecondary).map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuLinkItem, {
							className: twMerge(item.type === "icon" && "-mx-1 first:ms-0 last:me-0"),
							item
						}, i))
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-row items-center ms-auto -me-1.5 lg:hidden",
				children: [slots.searchTrigger && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.searchTrigger.sm, {
					hideIfDisabled: true,
					className: "p-2"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuItem, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuTrigger, {
						"aria-label": "Toggle Menu",
						className: twMerge(buttonVariants({
							size: "icon",
							color: "ghost",
							className: "group [&_svg]:size-5.5"
						})),
						onPointerMove: nav?.enableHoverToOpen ? void 0 : (e) => e.preventDefault(),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "transition-transform duration-300 group-data-[state=open]:rotate-180" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(NavigationMenuContent, {
						className: "flex flex-col p-4 sm:flex-row sm:items-center sm:justify-end",
						children: [menuItems.filter((item) => !isSecondary(item)).map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileNavigationMenuLinkItem, {
							item,
							className: "sm:hidden"
						}, i)), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "-ms-1.5 flex flex-row items-center gap-2 max-sm:mt-2",
							children: [
								menuItems.filter(isSecondary).map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileNavigationMenuLinkItem, {
									item,
									className: twMerge(item.type === "icon" && "-mx-1 first:ms-0")
								}, i)),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									role: "separator",
									className: "flex-1"
								}),
								slots.languageSelect && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(slots.languageSelect.root, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Languages, { className: "size-5" }),
									slots.languageSelect.text && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.languageSelect.text, {}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "size-3 text-fd-muted-foreground" })
								] }),
								slots.themeSwitch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.themeSwitch, {})
							]
						})]
					})] })
				})]
			})
		]
	});
}
function isSecondary(item) {
	if ("secondary" in item && item.secondary != null) return item.secondary;
	return item.type === "icon";
}
function HeaderNavigationMenu({ transparentMode = "none", ...props }) {
	const [value, setValue] = (0, import_react.useState)("");
	const isTop = useIsScrollTop({ enabled: transparentMode === "top" }) ?? true;
	const isTransparent = transparentMode === "top" ? isTop : transparentMode === "always";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenu, {
		value,
		onValueChange: setValue,
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
			id: "nd-nav",
			...props,
			className: twMerge("sticky h-14 top-0 z-40", props.className),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: twMerge("backdrop-blur-lg border-b transition-colors *:mx-auto *:max-w-(--fd-layout-width)", value.length > 0 && "max-lg:shadow-lg max-lg:rounded-b-2xl", (!isTransparent || value.length > 0) && "bg-fd-background/80"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuList, {
					className: "flex h-14 w-full items-center px-4",
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { children: props.children })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuViewport, {})]
			})
		})
	});
}
function NavigationMenuLinkItem({ item, ...props }) {
	if (item.type === "custom") return item.children;
	if (item.type === "menu") {
		const children = item.items.map((child, j) => {
			if (child.type === "custom") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: child.children }, j);
			const { banner = child.icon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "w-fit rounded-md border bg-fd-muted p-1 [&_svg]:size-4",
				children: child.icon
			}) : null, ...rest } = child.menu ?? {};
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuLink, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link$1, {
					href: child.url,
					external: child.external,
					...rest,
					className: twMerge("flex flex-col gap-2 rounded-lg border bg-fd-card p-3 transition-colors hover:bg-fd-accent/80 hover:text-fd-accent-foreground", rest.className),
					children: rest.children ?? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						banner,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-base font-medium",
							children: child.text
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-fd-muted-foreground empty:hidden",
							children: child.description
						})
					] })
				})
			}, `${j}-${child.url}`);
		});
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(NavigationMenuItem, {
			...props,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuTrigger, {
				className: twMerge(navItemVariants(), "rounded-md"),
				children: item.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link$1, {
					href: item.url,
					external: item.external,
					children: item.text
				}) : item.text
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuContent, {
				className: "grid grid-cols-1 gap-2 p-4 md:grid-cols-2 lg:grid-cols-3",
				children
			})]
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuItem, {
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuLink, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LinkItem, {
				item,
				"aria-label": item.type === "icon" ? item.label : void 0,
				className: twMerge(navItemVariants({ variant: item.type })),
				children: item.type === "icon" ? item.icon : item.text
			})
		})
	});
}
function MobileNavigationMenuLinkItem({ item, ...props }) {
	if (item.type === "custom") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: twMerge("grid", props.className),
		children: item.children
	});
	if (item.type === "menu") {
		const header = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [item.icon, item.text] });
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: twMerge("mb-4 flex flex-col", props.className),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-1 text-sm text-fd-muted-foreground",
				children: item.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuLink, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link$1, {
						href: item.url,
						external: item.external,
						children: header
					})
				}) : header
			}), item.items.map((child, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileNavigationMenuLinkItem, { item: child }, i))]
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuLink, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(LinkItem, {
			item,
			className: twMerge({
				main: "inline-flex items-center gap-2 py-1.5 transition-colors hover:text-fd-popover-foreground/50 data-[active=true]:font-medium data-[active=true]:text-fd-primary [&_svg]:size-4",
				icon: buttonVariants({
					size: "icon",
					color: "ghost"
				}),
				button: buttonVariants({
					color: "secondary",
					className: "gap-1.5 [&_svg]:size-4"
				})
			}[item.type ?? "main"], props.className),
			"aria-label": item.type === "icon" ? item.label : void 0,
			children: [item.icon, item.type === "icon" ? void 0 : item.text]
		})
	});
}
var LayoutContext = (0, import_react.createContext)(null);
function useHomeLayout() {
	const context = (0, import_react.use)(LayoutContext);
	if (!context) throw new Error("Please use this component under <HomeLayout /> (`fumadocs-ui/layouts/home`).");
	return context;
}
var { useProvider } = baseSlots({ useProps() {
	return useHomeLayout().props;
} });
function HomeLayout(props) {
	const { nav: { enabled: navEnabled = true } = {}, slots: defaultSlots, children, i18n: _i18n, githubUrl: _githubUrl, links: _links, themeSwitch: _themeSwitch, searchToggle: _searchToggle, ...rest } = props;
	const { baseSlots, baseProps } = useProvider(props);
	const linkItems = useLinkItems(props);
	const slots = {
		...baseSlots,
		header: defaultSlots?.header ?? Header,
		container: defaultSlots?.container ?? Container
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LayoutContext, {
		value: {
			props: baseProps,
			slots,
			...linkItems
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(slots.container, {
			...rest,
			children: [navEnabled && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(slots.header, {}), children]
		})
	});
}
var Route$2 = createFileRoute("/")({
	component: Home,
	head: () => ({ meta: [{ title: "Ultimate Harness — Portable discipline for agent-driven engineering" }, {
		name: "description",
		content: "Runtime-agnostic development harness for planning, launching, observing, verifying, and promoting agentic software work across Hermes, Codex, Hermes-Proxy, and Oh-My-Pi."
	}] })
});
var ADAPTERS = [
	{
		id: "hermes",
		status: "active",
		desc: "Direct Hermes server runtime, pinned to ≥ 0.14.0."
	},
	{
		id: "codex",
		status: "active",
		desc: "OpenAI Codex CLI transport with sandbox routing parity."
	},
	{
		id: "hermes-proxy",
		status: "active",
		desc: "ToS-positioned subscription gateway (nous / openai / anthropic providers)."
	},
	{
		id: "oh-my-pi",
		status: "experimental",
		desc: "Anthropic via Oh-My-Pi for ANTHROPIC_API_KEY routing."
	}
];
var FEATURES = [
	{
		title: "Mission packets",
		desc: "Portable, versioned work requests with workflow profile and runtime config. One spec, every runtime.",
		href: "/docs/$",
		params: { _splat: "architecture/mission-packet-schema" }
	},
	{
		title: "Sandbox isolation",
		desc: "git-worktree sandboxes by default; mission-bound, dirty-aware discard, ready for AgentFS swap-in.",
		href: "/docs/$",
		params: { _splat: "architecture/sandboxing" }
	},
	{
		title: "Live Mission Control TUI",
		desc: "Three-pane dashboard, mission drilldown with Code/Diff viewers, R-runs with live events.ndjson tail.",
		href: "/docs/$",
		params: { _splat: "runbooks/using-the-tui" }
	},
	{
		title: "Runtime adapter contract",
		desc: "Every adapter implements the same shape: dryRun, run, events emission, runtime-result schema.",
		href: "/docs/$",
		params: { _splat: "architecture/runtime-adapter-contract" }
	},
	{
		title: "Verify and promote",
		desc: "Sandbox work becomes canonical work only after verification gates pass. Audit trail is built in.",
		href: "/docs/$",
		params: { _splat: "architecture/verification-and-promotion" }
	},
	{
		title: "Audit-by-default",
		desc: "Append-only events.ndjson per mission; runtime-session.yaml summary; diff.patch captured per run.",
		href: "/docs/$",
		params: { _splat: "verification/audit-trail" }
	}
];
var PIPELINE = [
	{
		step: "1",
		title: "research",
		desc: "Inputs → narrative → adopt / reject / defer."
	},
	{
		step: "2",
		title: "spec",
		desc: "Mission packet drafted; acceptance criteria locked."
	},
	{
		step: "3",
		title: "plan",
		desc: "Workflow profile + runtime config + dispatch."
	},
	{
		step: "4",
		title: "sandbox",
		desc: "git-worktree spun up; mission bound."
	},
	{
		step: "5",
		title: "run",
		desc: "Adapter executes; events.ndjson tails live."
	},
	{
		step: "6",
		title: "verify",
		desc: "Checks gate promotion; review notes attached."
	},
	{
		step: "7",
		title: "promote",
		desc: "Sandbox → canonical; audit trail sealed."
	}
];
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HomeLayout, {
		...baseOptions(),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "relative isolate",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "uh-hero-backdrop",
					"aria-hidden": true
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mx-auto max-w-5xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "uh-mono mb-4 text-xs uppercase tracking-[0.2em] text-fd-muted-foreground",
							children: "v0.x · MIT · Bun + Node + TypeScript"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
							className: "text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]",
							children: [
								"One harness. Every coding agent.",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "uh-gradient",
									children: "Portable discipline."
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-6 text-lg sm:text-xl text-fd-muted-foreground max-w-2xl mx-auto",
							children: "Ultimate Harness plans, launches, observes, verifies, and promotes agentic software-development work across Hermes, Codex, Hermes Proxy, and Oh-My-Pi — without losing your specs, sandbox boundaries, or audit trail."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-10 flex flex-wrap gap-3 justify-center",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/docs/$",
									params: { _splat: "" },
									className: "inline-flex items-center gap-2 rounded-full px-5 py-3 font-medium bg-fd-primary text-fd-primary-foreground",
									children: "Read the docs →"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/docs/$",
									params: { _splat: "runbooks/using-the-tui" },
									className: "inline-flex items-center gap-2 rounded-full px-5 py-3 font-medium border border-fd-border",
									children: "Try the TUI"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
									href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness",
									className: "inline-flex items-center gap-2 rounded-full px-5 py-3 font-medium border border-fd-border",
									children: "GitHub"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-12 rounded-2xl border border-fd-border overflow-hidden text-left mx-auto max-w-3xl bg-fd-card",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "px-5 py-3 text-xs uh-mono text-fd-muted-foreground border-b border-fd-border flex items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-[#ff5f56]" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-[#ffbd2e]" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-[#27c93f]" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-3",
										children: "~/agent-work · zsh"
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
								className: "uh-mono text-sm leading-6 px-5 py-4 overflow-x-auto",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: `# install
$ bun add -g @agentic-engineering/ultimate-harness

# initialize a project
$ uh init

# add adapters (hermes, codex, hermes-proxy, oh-my-pi)
$ uh adapter add codex

# propose, run, verify
$ uh propose my-mission --workflow research-docs --goal "Refactor X"
$ uh mission run my-mission --runtime codex
$ uh verify my-mission

# or just open Mission Control
$ uh tui
` })
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mx-auto max-w-6xl px-6 py-12 sm:py-16",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-2xl sm:text-3xl font-semibold tracking-tight mb-6",
						children: "Adapters"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
						children: ADAPTERS.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "uh-card",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between mb-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "uh-mono font-semibold",
									children: a.id
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "uh-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-full " + (a.status === "active" ? "uh-pill-active" : "uh-pill-muted"),
									children: a.status
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-fd-muted-foreground",
								children: a.desc
							})]
						}, a.id))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mx-auto max-w-6xl px-6 py-12 sm:py-16",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-2xl sm:text-3xl font-semibold tracking-tight mb-2",
							children: "Pipeline"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-fd-muted-foreground mb-6 max-w-2xl",
							children: "Every mission moves through the same seven phases. Each phase is inspectable, replayable, and gated."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
							className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-7",
							children: PIPELINE.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "uh-card",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "uh-mono text-xs text-fd-muted-foreground mb-1",
										children: p.step
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-semibold",
										children: p.title
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xs text-fd-muted-foreground mt-1",
										children: p.desc
									})
								]
							}, p.step))
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "mx-auto max-w-6xl px-6 py-12 sm:py-16",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-2xl sm:text-3xl font-semibold tracking-tight mb-6",
						children: "What's in the box"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
						children: FEATURES.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: f.href,
							params: f.params,
							className: "uh-card group",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
									className: "font-semibold mb-1",
									children: f.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-fd-muted-foreground",
									children: f.desc
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 text-xs uh-mono uppercase tracking-wider text-fd-muted-foreground group-hover:text-fd-primary",
									children: "Read more →"
								})
							]
						}, f.title))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "mx-auto max-w-5xl px-6 py-12 sm:py-16",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-3xl border border-fd-border p-8 sm:p-12 relative overflow-hidden",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "uh-glow absolute inset-0 opacity-50",
							"aria-hidden": true
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "relative",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-2xl sm:text-3xl font-semibold tracking-tight",
									children: "Built for agent-driven engineering."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-4 text-fd-muted-foreground max-w-2xl",
									children: "A project should be able to use multiple coding-agent runtimes without losing its specifications, skills, workflow state, audit trail, sandbox boundaries, or human approval checkpoints. UH gives you the spec format, the dispatch table, the sandbox backend, the verification gate, and the live UI — all in one binary."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-6 flex flex-wrap gap-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
										to: "/docs/$",
										params: { _splat: "product/prd" },
										className: "inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium bg-fd-primary text-fd-primary-foreground",
										children: "Product brief"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
										to: "/docs/$",
										params: { _splat: "architecture/overview" },
										className: "inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium border border-fd-border",
										children: "Architecture"
									})]
								})
							]
						})]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
					className: "mx-auto max-w-6xl px-6 py-10 text-sm text-fd-muted-foreground flex flex-wrap items-center justify-between gap-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						"© ",
						(/* @__PURE__ */ new Date()).getFullYear(),
						" Agentic Engineering Agency"
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "uh-mono",
						children: "uh.agenticengineering.lat"
					})]
				})
			]
		})
	});
}
var Route$1 = createFileRoute("/docs/{$}.md")({ server: { handlers: { GET: async ({ params }) => {
	const slugs = markdownPathToSlugs(params._splat?.split("/") ?? []);
	const page = source.getPage(slugs);
	if (!page) throw notFound();
	return new Response(await getLLMText(page), { headers: { "Content-Type": "text/markdown" } });
} } } });
function createEndpoint(server, options = {}) {
	const { search } = server;
	const { readOptions = defaultReadOptions } = options;
	return {
		...server,
		async staticGET() {
			return Response.json(await server.export());
		},
		async GET(request) {
			const url = new URL(request.url);
			const query = url.searchParams.get("query");
			if (!query) return Response.json([]);
			return Response.json(await search(query, readOptions(url, request)));
		}
	};
}
function defaultReadOptions(url) {
	const params = url.searchParams;
	const limit = params.has("limit") ? Number(params.get("limit")) : void 0;
	return {
		tag: params.get("tag")?.split(","),
		locale: params.get("locale"),
		limit: Number.isInteger(limit) ? limit : void 0
	};
}
async function buildIndexDefault(page) {
	let structuredData;
	if ("structuredData" in page.data) structuredData = typeof page.data.structuredData === "function" ? await page.data.structuredData() : page.data.structuredData;
	else if ("load" in page.data && typeof page.data.load === "function") structuredData = (await page.data.load()).structuredData;
	if (!structuredData) throw new Error("Cannot find structured data from page, please define the page to index function.");
	return {
		title: page.data.title ?? basename(page.path, extname(page.path)),
		description: page.data.description,
		url: page.url,
		id: page.url,
		structuredData
	};
}
function isBreadcrumbItem(item) {
	return typeof item === "string" && item.length > 0;
}
function buildBreadcrumbs(source, page) {
	const pageTree = source.getPageTree(page.locale);
	const path = findPath(pageTree.children, (node) => node.type === "page" && node.url === page.url);
	if (path) {
		const breadcrumbs = [];
		path.pop();
		if (isBreadcrumbItem(pageTree.name)) breadcrumbs.push(pageTree.name);
		for (const segment of path) {
			if (!isBreadcrumbItem(segment.name)) continue;
			breadcrumbs.push(segment.name);
		}
		return breadcrumbs;
	}
}
function buildDocuments(indexes) {
	const docs = [];
	for (const page of indexes) {
		const pageTag = page.tag ?? [];
		const tags = Array.isArray(pageTag) ? pageTag : [pageTag];
		const data = page.structuredData;
		let id = 0;
		docs.push({
			id: page.id,
			page_id: page.id,
			type: "page",
			content: page.title,
			breadcrumbs: page.breadcrumbs,
			tags,
			url: page.url
		});
		const nextId = () => `${page.id}-${id++}`;
		if (page.description) docs.push({
			id: nextId(),
			page_id: page.id,
			tags,
			type: "text",
			url: page.url,
			content: page.description
		});
		for (const heading of data.headings) docs.push({
			id: nextId(),
			page_id: page.id,
			type: "heading",
			tags,
			url: `${page.url}#${heading.id}`,
			content: heading.content
		});
		for (const content of data.contents) docs.push({
			id: nextId(),
			page_id: page.id,
			tags,
			type: "text",
			url: content.heading ? `${page.url}#${content.heading}` : page.url,
			content: content.content
		});
	}
	return docs;
}
var STEMMERS = {
	arabic: "ar",
	armenian: "am",
	bulgarian: "bg",
	czech: "cz",
	danish: "dk",
	dutch: "nl",
	english: "en",
	finnish: "fi",
	french: "fr",
	german: "de",
	greek: "gr",
	hungarian: "hu",
	indian: "in",
	indonesian: "id",
	irish: "ie",
	italian: "it",
	lithuanian: "lt",
	nepali: "np",
	norwegian: "no",
	portuguese: "pt",
	romanian: "ro",
	russian: "ru",
	serbian: "rs",
	slovenian: "ru",
	spanish: "es",
	swedish: "se",
	tamil: "ta",
	turkish: "tr",
	ukrainian: "uk",
	vietnamese: "vi",
	sanskrit: "sk"
};
var simpleSchema = {
	url: "string",
	title: "string",
	breadcrumbs: "string[]",
	description: "string",
	content: "string",
	keywords: "string"
};
var advancedSchema = {
	content: "string",
	page_id: "string",
	type: "string",
	breadcrumbs: "string[]",
	tags: "enum[]",
	url: "string",
	embeddings: "vector[512]"
};
async function createDB({ indexes, tokenizer, search: _, ...rest }) {
	const items = typeof indexes === "function" ? await indexes() : indexes;
	const db = create({
		schema: advancedSchema,
		...rest,
		components: {
			...rest.components,
			tokenizer: tokenizer ?? rest.components?.tokenizer
		}
	});
	await insertMultiple(db, buildDocuments(items));
	return db;
}
async function createDBSimple({ indexes, tokenizer, ...rest }) {
	const items = typeof indexes === "function" ? await indexes() : indexes;
	const db = create({
		schema: simpleSchema,
		...rest,
		components: {
			...rest.components,
			tokenizer: tokenizer ?? rest.components?.tokenizer
		}
	});
	await insertMultiple(db, items.map((page) => ({
		title: page.title,
		description: page.description,
		breadcrumbs: page.breadcrumbs,
		url: page.url,
		content: page.content,
		keywords: page.keywords
	})));
	return db;
}
function initSimpleSearch(options) {
	const doc = createDBSimple(options);
	return {
		async export() {
			return {
				type: "simple",
				...save(await doc)
			};
		},
		async search(query, searchOptions = {}) {
			const db = await doc;
			const { limit } = searchOptions;
			return searchSimple(db, query, {
				limit,
				...options.search
			});
		}
	};
}
function initAdvancedSearch(options) {
	const get = createDB(options);
	return {
		async export() {
			return {
				type: "advanced",
				...save(await get)
			};
		},
		async search(query, searchOptions = {}) {
			const db = await get;
			const { limit, tag, mode } = searchOptions;
			return searchAdvanced(db, query, tag, {
				...options.search,
				limit,
				mode: mode === "vector" ? "vector" : "fulltext"
			}).catch((err) => {
				if (mode === "vector") throw new Error("failed to search, make sure you have installed `@orama/plugin-embeddings` according to their docs.", { cause: err });
				throw err;
			});
		}
	};
}
function getTokenizer(locale) {
	return { language: Object.keys(STEMMERS).find((lang) => STEMMERS[lang] === locale) ?? locale };
}
function createI18nSearchAPI(...[type, options]) {
	async function initSearchServers() {
		const map = /* @__PURE__ */ new Map();
		if (options.i18n.languages.length === 0) return map;
		const indexes = typeof options.indexes === "function" ? await options.indexes() : options.indexes;
		for (const locale of options.i18n.languages) {
			const localeIndexes = indexes.filter((index) => index.locale === locale);
			const mapped = options.localeMap?.[locale] ?? getTokenizer(locale);
			if (type === "simple") map.set(locale, typeof mapped === "object" ? initSimpleSearch({
				...options,
				...mapped,
				indexes: localeIndexes
			}) : initSimpleSearch({
				...options,
				language: mapped,
				indexes: localeIndexes
			}));
			else map.set(locale, typeof mapped === "object" ? initAdvancedSearch({
				...options,
				indexes: localeIndexes,
				...mapped
			}) : initAdvancedSearch({
				...options,
				language: mapped,
				indexes: localeIndexes
			}));
		}
		return map;
	}
	const get = initSearchServers();
	return toAPI({
		async export() {
			const map = await get;
			const entries = Array.from(map.entries()).map(async ([k, v]) => [k, await v.export()]);
			return {
				type: "i18n",
				data: Object.fromEntries(await Promise.all(entries))
			};
		},
		async search(query, searchOptions) {
			const map = await get;
			const locale = searchOptions?.locale ?? options.i18n.defaultLanguage;
			const handler = map.get(locale);
			if (handler) return handler.search(query, searchOptions);
			return [];
		}
	});
}
/**
* create server from loader, if passed as function, the server will re-index all records once a different instance of loader is returned.
*/
function createFromSource(loader, options = {}) {
	const { buildIndex = buildIndexDefault } = options;
	const cache = /* @__PURE__ */ new WeakMap();
	async function initServer(loader) {
		const indexes = await Promise.all(loader.getPages().map(async (page) => {
			const index = await buildIndex(page);
			return {
				...index,
				breadcrumbs: index.breadcrumbs ?? buildBreadcrumbs(loader, page),
				locale: page.locale
			};
		}));
		if (loader._i18n) return createI18nSearchAPI("advanced", {
			...options,
			indexes,
			i18n: loader._i18n
		});
		return initAdvancedSearch({
			indexes,
			...options
		});
	}
	async function getCurrentServer() {
		const l = typeof loader === "function" ? await loader() : loader;
		let server = cache.get(l);
		if (!server) {
			server = initServer(l);
			cache.set(l, server);
		}
		return await server;
	}
	return toAPI({
		async export() {
			return (await getCurrentServer()).export();
		},
		async search(query, options) {
			return (await getCurrentServer()).search(query, options);
		}
	});
}
function toAPI(server) {
	return createEndpoint(server, { readOptions(url) {
		return {
			...defaultReadOptions(url),
			mode: url.searchParams.get("mode") === "vector" ? "vector" : "full"
		};
	} });
}
var server = createFromSource(source, { language: "english" });
var Route = createFileRoute("/api/search")({ server: { handlers: { GET: () => server.staticGET() } } });
var LlmsDottxtRoute = Route$4.update({
	id: "/llms.txt",
	path: "/llms.txt",
	getParentRoute: () => Route$5
});
var LlmsFullDottxtRoute = Route$3.update({
	id: "/llms-full.txt",
	path: "/llms-full.txt",
	getParentRoute: () => Route$5
});
var IndexRoute = Route$2.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$5
});
var DocsChar123Char125DotmdRoute = Route$1.update({
	id: "/docs/{$}.md",
	path: "/docs/{$}.md",
	getParentRoute: () => Route$5
});
var DocsSplatRoute = Route$6.update({
	id: "/docs/$",
	path: "/docs/$",
	getParentRoute: () => Route$5
});
var rootRouteChildren = {
	IndexRoute,
	LlmsFullDottxtRoute,
	LlmsDottxtRoute,
	ApiSearchRoute: Route.update({
		id: "/api/search",
		path: "/api/search",
		getParentRoute: () => Route$5
	}),
	DocsSplatRoute,
	DocsChar123Char125DotmdRoute
};
var routeTree = Route$5._addFileChildren(rootRouteChildren)._addFileTypes();
/**
* the default not found page content, please make your own if you want to customize it.
*/
function DefaultNotFound() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col px-8 justify-center flex-1 text-center items-center gap-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-6xl font-bold text-fd-muted-foreground",
				children: "404"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-2xl font-semibold",
				children: "Page Not Found"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-fd-muted-foreground max-w-md",
				children: "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link$1, {
				href: "/",
				className: twMerge(buttonVariants({
					className: "mt-4 gap-1.5",
					variant: "primary"
				})),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(House, { className: "size-4" }), "Back to Home"]
			})
		]
	});
}
function NotFound() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HomeLayout, {
		...baseOptions(),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DefaultNotFound, {})
	});
}
function getRouter() {
	return createRouter({
		routeTree,
		defaultPreload: "intent",
		scrollRestoration: true,
		defaultNotFoundComponent: NotFound
	});
}
//#endregion
export { getRouter };
