import { i as __toESM } from "../_runtime.mjs";
import { a as useComposedRefs, n as Primitive, o as require_jsx_runtime } from "./@radix-ui/react-arrow+[...].mjs";
import { u as require_react } from "./@floating-ui/react-dom+[...].mjs";
import { t as composeEventHandlers } from "./radix-ui__primitive.mjs";
import { i as useControllableState, l as createContextScope, o as useId } from "./@radix-ui/react-collapsible+[...].mjs";
import { d as useCallbackRef } from "./@radix-ui/react-dialog+[...].mjs";
import { n as useDirection } from "./radix-ui__react-direction.mjs";
import { t as createCollection } from "./@radix-ui/react-collection+[...].mjs";
//#region node_modules/@radix-ui/react-roving-focus/dist/index.mjs
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime(), 1);
var ENTRY_FOCUS = "rovingFocusGroup.onEntryFocus";
var EVENT_OPTIONS = {
	bubbles: false,
	cancelable: true
};
var GROUP_NAME = "RovingFocusGroup";
var [Collection, useCollection, createCollectionScope] = createCollection(GROUP_NAME);
var [createRovingFocusGroupContext, createRovingFocusGroupScope] = createContextScope(GROUP_NAME, [createCollectionScope]);
var [RovingFocusProvider, useRovingFocusContext] = createRovingFocusGroupContext(GROUP_NAME);
var RovingFocusGroup = import_react.forwardRef((props, forwardedRef) => {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Collection.Provider, {
		scope: props.__scopeRovingFocusGroup,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Collection.Slot, {
			scope: props.__scopeRovingFocusGroup,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RovingFocusGroupImpl, {
				...props,
				ref: forwardedRef
			})
		})
	});
});
RovingFocusGroup.displayName = GROUP_NAME;
var RovingFocusGroupImpl = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeRovingFocusGroup, orientation, loop = false, dir, currentTabStopId: currentTabStopIdProp, defaultCurrentTabStopId, onCurrentTabStopIdChange, onEntryFocus, preventScrollOnEntryFocus = false, ...groupProps } = props;
	const ref = import_react.useRef(null);
	const composedRefs = useComposedRefs(forwardedRef, ref);
	const direction = useDirection(dir);
	const [currentTabStopId, setCurrentTabStopId] = useControllableState({
		prop: currentTabStopIdProp,
		defaultProp: defaultCurrentTabStopId ?? null,
		onChange: onCurrentTabStopIdChange,
		caller: GROUP_NAME
	});
	const [isTabbingBackOut, setIsTabbingBackOut] = import_react.useState(false);
	const handleEntryFocus = useCallbackRef(onEntryFocus);
	const getItems = useCollection(__scopeRovingFocusGroup);
	const isClickFocusRef = import_react.useRef(false);
	const [focusableItemsCount, setFocusableItemsCount] = import_react.useState(0);
	import_react.useEffect(() => {
		const node = ref.current;
		if (node) {
			node.addEventListener(ENTRY_FOCUS, handleEntryFocus);
			return () => node.removeEventListener(ENTRY_FOCUS, handleEntryFocus);
		}
	}, [handleEntryFocus]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RovingFocusProvider, {
		scope: __scopeRovingFocusGroup,
		orientation,
		dir: direction,
		loop,
		currentTabStopId,
		onItemFocus: import_react.useCallback((tabStopId) => setCurrentTabStopId(tabStopId), [setCurrentTabStopId]),
		onItemShiftTab: import_react.useCallback(() => setIsTabbingBackOut(true), []),
		onFocusableItemAdd: import_react.useCallback(() => setFocusableItemsCount((prevCount) => prevCount + 1), []),
		onFocusableItemRemove: import_react.useCallback(() => setFocusableItemsCount((prevCount) => prevCount - 1), []),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
			tabIndex: isTabbingBackOut || focusableItemsCount === 0 ? -1 : 0,
			"data-orientation": orientation,
			...groupProps,
			ref: composedRefs,
			style: {
				outline: "none",
				...props.style
			},
			onMouseDown: composeEventHandlers(props.onMouseDown, () => {
				isClickFocusRef.current = true;
			}),
			onFocus: composeEventHandlers(props.onFocus, (event) => {
				const isKeyboardFocus = !isClickFocusRef.current;
				if (event.target === event.currentTarget && isKeyboardFocus && !isTabbingBackOut) {
					const entryFocusEvent = new CustomEvent(ENTRY_FOCUS, EVENT_OPTIONS);
					event.currentTarget.dispatchEvent(entryFocusEvent);
					if (!entryFocusEvent.defaultPrevented) {
						const items = getItems().filter((item) => item.focusable);
						focusFirst([
							items.find((item) => item.active),
							items.find((item) => item.id === currentTabStopId),
							...items
						].filter(Boolean).map((item) => item.ref.current), preventScrollOnEntryFocus);
					}
				}
				isClickFocusRef.current = false;
			}),
			onBlur: composeEventHandlers(props.onBlur, () => setIsTabbingBackOut(false))
		})
	});
});
var ITEM_NAME = "RovingFocusGroupItem";
var RovingFocusGroupItem = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeRovingFocusGroup, focusable = true, active = false, tabStopId, children, ...itemProps } = props;
	const autoId = useId();
	const id = tabStopId || autoId;
	const context = useRovingFocusContext(ITEM_NAME, __scopeRovingFocusGroup);
	const isCurrentTabStop = context.currentTabStopId === id;
	const getItems = useCollection(__scopeRovingFocusGroup);
	const { onFocusableItemAdd, onFocusableItemRemove, currentTabStopId } = context;
	import_react.useEffect(() => {
		if (focusable) {
			onFocusableItemAdd();
			return () => onFocusableItemRemove();
		}
	}, [
		focusable,
		onFocusableItemAdd,
		onFocusableItemRemove
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Collection.ItemSlot, {
		scope: __scopeRovingFocusGroup,
		id,
		focusable,
		active,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.span, {
			tabIndex: isCurrentTabStop ? 0 : -1,
			"data-orientation": context.orientation,
			...itemProps,
			ref: forwardedRef,
			onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
				if (!focusable) event.preventDefault();
				else context.onItemFocus(id);
			}),
			onFocus: composeEventHandlers(props.onFocus, () => context.onItemFocus(id)),
			onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
				if (event.key === "Tab" && event.shiftKey) {
					context.onItemShiftTab();
					return;
				}
				if (event.target !== event.currentTarget) return;
				const focusIntent = getFocusIntent(event, context.orientation, context.dir);
				if (focusIntent !== void 0) {
					if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
					event.preventDefault();
					let candidateNodes = getItems().filter((item) => item.focusable).map((item) => item.ref.current);
					if (focusIntent === "last") candidateNodes.reverse();
					else if (focusIntent === "prev" || focusIntent === "next") {
						if (focusIntent === "prev") candidateNodes.reverse();
						const currentIndex = candidateNodes.indexOf(event.currentTarget);
						candidateNodes = context.loop ? wrapArray(candidateNodes, currentIndex + 1) : candidateNodes.slice(currentIndex + 1);
					}
					setTimeout(() => focusFirst(candidateNodes));
				}
			}),
			children: typeof children === "function" ? children({
				isCurrentTabStop,
				hasTabStop: currentTabStopId != null
			}) : children
		})
	});
});
RovingFocusGroupItem.displayName = ITEM_NAME;
var MAP_KEY_TO_FOCUS_INTENT = {
	ArrowLeft: "prev",
	ArrowUp: "prev",
	ArrowRight: "next",
	ArrowDown: "next",
	PageUp: "first",
	Home: "first",
	PageDown: "last",
	End: "last"
};
function getDirectionAwareKey(key, dir) {
	if (dir !== "rtl") return key;
	return key === "ArrowLeft" ? "ArrowRight" : key === "ArrowRight" ? "ArrowLeft" : key;
}
function getFocusIntent(event, orientation, dir) {
	const key = getDirectionAwareKey(event.key, dir);
	if (orientation === "vertical" && ["ArrowLeft", "ArrowRight"].includes(key)) return void 0;
	if (orientation === "horizontal" && ["ArrowUp", "ArrowDown"].includes(key)) return void 0;
	return MAP_KEY_TO_FOCUS_INTENT[key];
}
function focusFirst(candidates, preventScroll = false) {
	const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
	for (const candidate of candidates) {
		if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
		candidate.focus({ preventScroll });
		if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
	}
}
function wrapArray(array, startIndex) {
	return array.map((_, index) => array[(startIndex + index) % array.length]);
}
var Root = RovingFocusGroup;
var Item = RovingFocusGroupItem;
//#endregion
export { Root as n, createRovingFocusGroupScope as r, Item as t };
