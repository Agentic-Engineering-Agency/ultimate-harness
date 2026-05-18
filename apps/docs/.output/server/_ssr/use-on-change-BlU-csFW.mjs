import { i as __toESM } from "../_runtime.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { t as cva } from "../_libs/class-variance-authority+clsx.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/use-on-change-BlU-csFW.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var notImplemented = () => {
	throw new Error("You need to wrap your application inside `FrameworkProvider`.");
};
var FrameworkContext = (0, import_react.createContext)({
	useParams: notImplemented,
	useRouter: notImplemented,
	usePathname: notImplemented
});
function FrameworkProvider({ Link, useRouter, useParams, usePathname, Image, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FrameworkContext, {
		value: (0, import_react.useMemo)(() => ({
			usePathname,
			useRouter,
			Link,
			Image,
			useParams
		}), [
			Link,
			usePathname,
			useRouter,
			useParams,
			Image
		]),
		children
	});
}
function usePathname() {
	return (0, import_react.use)(FrameworkContext).usePathname();
}
function useRouter() {
	return (0, import_react.use)(FrameworkContext).useRouter();
}
function Image(props) {
	const { Image } = (0, import_react.use)(FrameworkContext);
	if (!Image) {
		const { src, alt, priority, ...rest } = props;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			alt,
			src,
			fetchPriority: priority ? "high" : "auto",
			...rest
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Image, { ...props });
}
function Link(props) {
	const { Link } = (0, import_react.use)(FrameworkContext);
	if (!Link) {
		const { href, prefetch: _, ...rest } = props;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
			href,
			...rest
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, { ...props });
}
var defaultTranslations = {
	search: "Search",
	searchNoResult: "No results found",
	toc: "On this page",
	tocNoHeadings: "No Headings",
	lastUpdate: "Last updated on",
	chooseLanguage: "Choose a language",
	nextPage: "Next Page",
	previousPage: "Previous Page",
	chooseTheme: "Theme",
	editOnGithub: "Edit on GitHub"
};
var I18nContext = (0, import_react.createContext)({ text: { ...defaultTranslations } });
function I18nLabel(props) {
	return useI18n().text[props.label];
}
function useI18n() {
	return (0, import_react.useContext)(I18nContext);
}
function I18nProvider({ locales = [], locale, onLocaleChange, children, translations }) {
	const router = useRouter();
	const pathname = usePathname();
	const onChange = (value) => {
		if (onLocaleChange) return onLocaleChange(value);
		const segments = pathname.split("/").filter((v) => v.length > 0);
		if (segments.length === 0 || segments[0] !== locale) segments.unshift(value);
		else segments[0] = value;
		router.push(`/${segments.join("/")}`);
	};
	const onChangeRef = (0, import_react.useRef)(onChange);
	onChangeRef.current = onChange;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(I18nContext, {
		value: (0, import_react.useMemo)(() => ({
			locale,
			locales,
			text: {
				...defaultTranslations,
				...translations
			},
			onChange: (v) => onChangeRef.current(v)
		}), [
			locale,
			locales,
			translations
		]),
		children
	});
}
var variants = {
	primary: "bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/80 disabled:bg-fd-secondary disabled:text-fd-secondary-foreground",
	outline: "border hover:bg-fd-accent hover:text-fd-accent-foreground",
	ghost: "hover:bg-fd-accent hover:text-fd-accent-foreground",
	secondary: "border bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent hover:text-fd-accent-foreground"
};
var buttonVariants = cva("inline-flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring", { variants: {
	variant: variants,
	color: variants,
	size: {
		sm: "gap-1 px-2 py-1.5 text-xs",
		icon: "p-1.5 [&_svg]:size-5",
		"icon-sm": "p-1.5 [&_svg]:size-4.5",
		"icon-xs": "p-1 [&_svg]:size-4"
	}
} });
function isEqualShallow(a, b) {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) return b.length === a.length && a.every((v, i) => isEqualShallow(v, b[i]));
	return false;
}
/**
* @param value - state to watch
* @param onChange - when the state changed
* @param isUpdated - a function that determines if the state is updated
*/
function useOnChange(value, onChange, isUpdated = (a, b) => !isEqualShallow(a, b)) {
	const [prev, setPrev] = (0, import_react.useState)(value);
	if (isUpdated(prev, value)) {
		onChange(value, prev);
		setPrev(value);
	}
}
//#endregion
export { Link as a, useI18n as c, useRouter as d, Image as i, useOnChange as l, I18nLabel as n, buttonVariants as o, I18nProvider as r, isEqualShallow as s, FrameworkProvider as t, usePathname as u };
