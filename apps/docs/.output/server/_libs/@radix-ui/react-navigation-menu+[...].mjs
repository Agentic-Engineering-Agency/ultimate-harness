import { i as __toESM } from "../../_runtime.mjs";
import { a as useComposedRefs, i as composeRefs, n as Primitive, o as require_jsx_runtime, r as dispatchDiscreteCustomEvent } from "./react-arrow+[...].mjs";
import { l as require_react_dom, u as require_react } from "../@floating-ui/react-dom+[...].mjs";
import { t as composeEventHandlers } from "../radix-ui__primitive.mjs";
import { a as Presence, i as useControllableState, l as createContextScope, o as useId, s as useLayoutEffect2 } from "./react-collapsible+[...].mjs";
import { d as useCallbackRef, u as DismissableLayer } from "./react-dialog+[...].mjs";
import { n as useDirection } from "../radix-ui__react-direction.mjs";
import { t as createCollection } from "./react-collection+[...].mjs";
//#region node_modules/@radix-ui/react-use-previous/dist/index.mjs
var import_react_dom = /* @__PURE__ */ __toESM(require_react_dom(), 1);
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function usePrevious(value) {
	const ref = import_react.useRef({
		value,
		previous: value
	});
	return import_react.useMemo(() => {
		if (ref.current.value !== value) {
			ref.current.previous = ref.current.value;
			ref.current.value = value;
		}
		return ref.current.previous;
	}, [value]);
}
//#endregion
//#region node_modules/@radix-ui/react-visually-hidden/dist/index.mjs
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime(), 1);
var VISUALLY_HIDDEN_STYLES = Object.freeze({
	position: "absolute",
	border: 0,
	width: 1,
	height: 1,
	padding: 0,
	margin: -1,
	overflow: "hidden",
	clip: "rect(0, 0, 0, 0)",
	whiteSpace: "nowrap",
	wordWrap: "normal"
});
var NAME = "VisuallyHidden";
var VisuallyHidden = import_react.forwardRef((props, forwardedRef) => {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.span, {
		...props,
		ref: forwardedRef,
		style: {
			...VISUALLY_HIDDEN_STYLES,
			...props.style
		}
	});
});
VisuallyHidden.displayName = NAME;
var Root = VisuallyHidden;
//#endregion
//#region node_modules/@radix-ui/react-navigation-menu/dist/index.mjs
var NAVIGATION_MENU_NAME = "NavigationMenu";
var [Collection, useCollection, createCollectionScope] = createCollection(NAVIGATION_MENU_NAME);
var [FocusGroupCollection, useFocusGroupCollection, createFocusGroupCollectionScope] = createCollection(NAVIGATION_MENU_NAME);
var [createNavigationMenuContext, createNavigationMenuScope] = createContextScope(NAVIGATION_MENU_NAME, [createCollectionScope, createFocusGroupCollectionScope]);
var [NavigationMenuProviderImpl, useNavigationMenuContext] = createNavigationMenuContext(NAVIGATION_MENU_NAME);
var [ViewportContentProvider, useViewportContentContext] = createNavigationMenuContext(NAVIGATION_MENU_NAME);
var NavigationMenu = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, value: valueProp, onValueChange, defaultValue, delayDuration = 200, skipDelayDuration = 300, orientation = "horizontal", dir, ...NavigationMenuProps } = props;
	const [navigationMenu, setNavigationMenu] = import_react.useState(null);
	const composedRef = useComposedRefs(forwardedRef, (node) => setNavigationMenu(node));
	const direction = useDirection(dir);
	const openTimerRef = import_react.useRef(0);
	const closeTimerRef = import_react.useRef(0);
	const skipDelayTimerRef = import_react.useRef(0);
	const [isOpenDelayed, setIsOpenDelayed] = import_react.useState(true);
	const [value, setValue] = useControllableState({
		prop: valueProp,
		onChange: (value2) => {
			const isOpen = value2 !== "";
			const hasSkipDelayDuration = skipDelayDuration > 0;
			if (isOpen) {
				window.clearTimeout(skipDelayTimerRef.current);
				if (hasSkipDelayDuration) setIsOpenDelayed(false);
			} else {
				window.clearTimeout(skipDelayTimerRef.current);
				skipDelayTimerRef.current = window.setTimeout(() => setIsOpenDelayed(true), skipDelayDuration);
			}
			onValueChange?.(value2);
		},
		defaultProp: defaultValue ?? "",
		caller: NAVIGATION_MENU_NAME
	});
	const startCloseTimer = import_react.useCallback(() => {
		window.clearTimeout(closeTimerRef.current);
		closeTimerRef.current = window.setTimeout(() => setValue(""), 150);
	}, [setValue]);
	const handleOpen = import_react.useCallback((itemValue) => {
		window.clearTimeout(closeTimerRef.current);
		setValue(itemValue);
	}, [setValue]);
	const handleDelayedOpen = import_react.useCallback((itemValue) => {
		if (value === itemValue) window.clearTimeout(closeTimerRef.current);
		else openTimerRef.current = window.setTimeout(() => {
			window.clearTimeout(closeTimerRef.current);
			setValue(itemValue);
		}, delayDuration);
	}, [
		value,
		setValue,
		delayDuration
	]);
	import_react.useEffect(() => {
		return () => {
			window.clearTimeout(openTimerRef.current);
			window.clearTimeout(closeTimerRef.current);
			window.clearTimeout(skipDelayTimerRef.current);
		};
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuProvider, {
		scope: __scopeNavigationMenu,
		isRootMenu: true,
		value,
		dir: direction,
		orientation,
		rootNavigationMenu: navigationMenu,
		onTriggerEnter: (itemValue) => {
			window.clearTimeout(openTimerRef.current);
			if (isOpenDelayed) handleDelayedOpen(itemValue);
			else handleOpen(itemValue);
		},
		onTriggerLeave: () => {
			window.clearTimeout(openTimerRef.current);
			startCloseTimer();
		},
		onContentEnter: () => window.clearTimeout(closeTimerRef.current),
		onContentLeave: startCloseTimer,
		onItemSelect: (itemValue) => {
			setValue((prevValue) => prevValue === itemValue ? "" : itemValue);
		},
		onItemDismiss: () => setValue(""),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.nav, {
			"aria-label": "Main",
			"data-orientation": orientation,
			dir: direction,
			...NavigationMenuProps,
			ref: composedRef
		})
	});
});
NavigationMenu.displayName = NAVIGATION_MENU_NAME;
var SUB_NAME = "NavigationMenuSub";
var NavigationMenuSub = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, value: valueProp, onValueChange, defaultValue, orientation = "horizontal", ...subProps } = props;
	const context = useNavigationMenuContext(SUB_NAME, __scopeNavigationMenu);
	const [value, setValue] = useControllableState({
		prop: valueProp,
		onChange: onValueChange,
		defaultProp: defaultValue ?? "",
		caller: SUB_NAME
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuProvider, {
		scope: __scopeNavigationMenu,
		isRootMenu: false,
		value,
		dir: context.dir,
		orientation,
		rootNavigationMenu: context.rootNavigationMenu,
		onTriggerEnter: (itemValue) => setValue(itemValue),
		onItemSelect: (itemValue) => setValue(itemValue),
		onItemDismiss: () => setValue(""),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
			"data-orientation": orientation,
			...subProps,
			ref: forwardedRef
		})
	});
});
NavigationMenuSub.displayName = SUB_NAME;
var NavigationMenuProvider = (props) => {
	const { scope, isRootMenu, rootNavigationMenu, dir, orientation, children, value, onItemSelect, onItemDismiss, onTriggerEnter, onTriggerLeave, onContentEnter, onContentLeave } = props;
	const [viewport, setViewport] = import_react.useState(null);
	const [viewportContent, setViewportContent] = import_react.useState(/* @__PURE__ */ new Map());
	const [indicatorTrack, setIndicatorTrack] = import_react.useState(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuProviderImpl, {
		scope,
		isRootMenu,
		rootNavigationMenu,
		value,
		previousValue: usePrevious(value),
		baseId: useId(),
		dir,
		orientation,
		viewport,
		onViewportChange: setViewport,
		indicatorTrack,
		onIndicatorTrackChange: setIndicatorTrack,
		onTriggerEnter: useCallbackRef(onTriggerEnter),
		onTriggerLeave: useCallbackRef(onTriggerLeave),
		onContentEnter: useCallbackRef(onContentEnter),
		onContentLeave: useCallbackRef(onContentLeave),
		onItemSelect: useCallbackRef(onItemSelect),
		onItemDismiss: useCallbackRef(onItemDismiss),
		onViewportContentChange: import_react.useCallback((contentValue, contentData) => {
			setViewportContent((prevContent) => {
				prevContent.set(contentValue, contentData);
				return new Map(prevContent);
			});
		}, []),
		onViewportContentRemove: import_react.useCallback((contentValue) => {
			setViewportContent((prevContent) => {
				if (!prevContent.has(contentValue)) return prevContent;
				prevContent.delete(contentValue);
				return new Map(prevContent);
			});
		}, []),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Collection.Provider, {
			scope,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ViewportContentProvider, {
				scope,
				items: viewportContent,
				children
			})
		})
	});
};
var LIST_NAME = "NavigationMenuList";
var NavigationMenuList = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, ...listProps } = props;
	const context = useNavigationMenuContext(LIST_NAME, __scopeNavigationMenu);
	const list = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.ul, {
		"data-orientation": context.orientation,
		...listProps,
		ref: forwardedRef
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
		style: { position: "relative" },
		ref: context.onIndicatorTrackChange,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Collection.Slot, {
			scope: __scopeNavigationMenu,
			children: context.isRootMenu ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FocusGroup, {
				asChild: true,
				children: list
			}) : list
		})
	});
});
NavigationMenuList.displayName = LIST_NAME;
var ITEM_NAME = "NavigationMenuItem";
var [NavigationMenuItemContextProvider, useNavigationMenuItemContext] = createNavigationMenuContext(ITEM_NAME);
var NavigationMenuItem = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, value: valueProp, ...itemProps } = props;
	const autoValue = useId();
	const value = valueProp || autoValue || "LEGACY_REACT_AUTO_VALUE";
	const contentRef = import_react.useRef(null);
	const triggerRef = import_react.useRef(null);
	const focusProxyRef = import_react.useRef(null);
	const restoreContentTabOrderRef = import_react.useRef(() => {});
	const wasEscapeCloseRef = import_react.useRef(false);
	const handleContentEntry = import_react.useCallback((side = "start") => {
		if (contentRef.current) {
			restoreContentTabOrderRef.current();
			const candidates = getTabbableCandidates(contentRef.current);
			if (candidates.length) focusFirst(side === "start" ? candidates : candidates.reverse());
		}
	}, []);
	const handleContentExit = import_react.useCallback(() => {
		if (contentRef.current) {
			const candidates = getTabbableCandidates(contentRef.current);
			if (candidates.length) restoreContentTabOrderRef.current = removeFromTabOrder(candidates);
		}
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuItemContextProvider, {
		scope: __scopeNavigationMenu,
		value,
		triggerRef,
		contentRef,
		focusProxyRef,
		wasEscapeCloseRef,
		onEntryKeyDown: handleContentEntry,
		onFocusProxyEnter: handleContentEntry,
		onRootContentClose: handleContentExit,
		onContentFocusOutside: handleContentExit,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.li, {
			...itemProps,
			ref: forwardedRef
		})
	});
});
NavigationMenuItem.displayName = ITEM_NAME;
var TRIGGER_NAME = "NavigationMenuTrigger";
var NavigationMenuTrigger = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, disabled, ...triggerProps } = props;
	const context = useNavigationMenuContext(TRIGGER_NAME, props.__scopeNavigationMenu);
	const itemContext = useNavigationMenuItemContext(TRIGGER_NAME, props.__scopeNavigationMenu);
	const ref = import_react.useRef(null);
	const composedRefs = useComposedRefs(ref, itemContext.triggerRef, forwardedRef);
	const triggerId = makeTriggerId(context.baseId, itemContext.value);
	const contentId = makeContentId(context.baseId, itemContext.value);
	const hasPointerMoveOpenedRef = import_react.useRef(false);
	const wasClickCloseRef = import_react.useRef(false);
	const open = itemContext.value === context.value;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Collection.ItemSlot, {
		scope: __scopeNavigationMenu,
		value: itemContext.value,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FocusGroupItem, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.button, {
				id: triggerId,
				disabled,
				"data-disabled": disabled ? "" : void 0,
				"data-state": getOpenState(open),
				"aria-expanded": open,
				"aria-controls": contentId,
				...triggerProps,
				ref: composedRefs,
				onPointerEnter: composeEventHandlers(props.onPointerEnter, () => {
					wasClickCloseRef.current = false;
					itemContext.wasEscapeCloseRef.current = false;
				}),
				onPointerMove: composeEventHandlers(props.onPointerMove, whenMouse(() => {
					if (disabled || wasClickCloseRef.current || itemContext.wasEscapeCloseRef.current || hasPointerMoveOpenedRef.current) return;
					context.onTriggerEnter(itemContext.value);
					hasPointerMoveOpenedRef.current = true;
				})),
				onPointerLeave: composeEventHandlers(props.onPointerLeave, whenMouse(() => {
					if (disabled) return;
					context.onTriggerLeave();
					hasPointerMoveOpenedRef.current = false;
				})),
				onClick: composeEventHandlers(props.onClick, () => {
					context.onItemSelect(itemContext.value);
					wasClickCloseRef.current = open;
				}),
				onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
					const entryKey = {
						horizontal: "ArrowDown",
						vertical: context.dir === "rtl" ? "ArrowLeft" : "ArrowRight"
					}[context.orientation];
					if (open && event.key === entryKey) {
						itemContext.onEntryKeyDown();
						event.preventDefault();
					}
				})
			})
		})
	}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Root, {
		"aria-hidden": true,
		tabIndex: 0,
		ref: itemContext.focusProxyRef,
		onFocus: (event) => {
			const content = itemContext.contentRef.current;
			const prevFocusedElement = event.relatedTarget;
			const wasTriggerFocused = prevFocusedElement === ref.current;
			const wasFocusFromContent = content?.contains(prevFocusedElement);
			if (wasTriggerFocused || !wasFocusFromContent) itemContext.onFocusProxyEnter(wasTriggerFocused ? "start" : "end");
		}
	}), context.viewport && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-owns": contentId })] })] });
});
NavigationMenuTrigger.displayName = TRIGGER_NAME;
var LINK_NAME = "NavigationMenuLink";
var LINK_SELECT = "navigationMenu.linkSelect";
var NavigationMenuLink = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, active, onSelect, ...linkProps } = props;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FocusGroupItem, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.a, {
			"data-active": active ? "" : void 0,
			"aria-current": active ? "page" : void 0,
			...linkProps,
			ref: forwardedRef,
			onClick: composeEventHandlers(props.onClick, (event) => {
				const target = event.target;
				const linkSelectEvent = new CustomEvent(LINK_SELECT, {
					bubbles: true,
					cancelable: true
				});
				target.addEventListener(LINK_SELECT, (event2) => onSelect?.(event2), { once: true });
				dispatchDiscreteCustomEvent(target, linkSelectEvent);
				if (!linkSelectEvent.defaultPrevented && !event.metaKey) dispatchDiscreteCustomEvent(target, new CustomEvent(ROOT_CONTENT_DISMISS, {
					bubbles: true,
					cancelable: true
				}));
			}, { checkForDefaultPrevented: false })
		})
	});
});
NavigationMenuLink.displayName = LINK_NAME;
var INDICATOR_NAME = "NavigationMenuIndicator";
var NavigationMenuIndicator = import_react.forwardRef((props, forwardedRef) => {
	const { forceMount, ...indicatorProps } = props;
	const context = useNavigationMenuContext(INDICATOR_NAME, props.__scopeNavigationMenu);
	const isVisible = Boolean(context.value);
	return context.indicatorTrack ? import_react_dom.createPortal(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Presence, {
		present: forceMount || isVisible,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuIndicatorImpl, {
			...indicatorProps,
			ref: forwardedRef
		})
	}), context.indicatorTrack) : null;
});
NavigationMenuIndicator.displayName = INDICATOR_NAME;
var NavigationMenuIndicatorImpl = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, ...indicatorProps } = props;
	const context = useNavigationMenuContext(INDICATOR_NAME, __scopeNavigationMenu);
	const getItems = useCollection(__scopeNavigationMenu);
	const [activeTrigger, setActiveTrigger] = import_react.useState(null);
	const [position, setPosition] = import_react.useState(null);
	const isHorizontal = context.orientation === "horizontal";
	const isVisible = Boolean(context.value);
	import_react.useEffect(() => {
		const triggerNode = getItems().find((item) => item.value === context.value)?.ref.current;
		if (triggerNode) setActiveTrigger(triggerNode);
	}, [getItems, context.value]);
	const handlePositionChange = () => {
		if (activeTrigger) setPosition({
			size: isHorizontal ? activeTrigger.offsetWidth : activeTrigger.offsetHeight,
			offset: isHorizontal ? activeTrigger.offsetLeft : activeTrigger.offsetTop
		});
	};
	useResizeObserver(activeTrigger, handlePositionChange);
	useResizeObserver(context.indicatorTrack, handlePositionChange);
	return position ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
		"aria-hidden": true,
		"data-state": isVisible ? "visible" : "hidden",
		"data-orientation": context.orientation,
		...indicatorProps,
		ref: forwardedRef,
		style: {
			position: "absolute",
			...isHorizontal ? {
				left: 0,
				width: position.size + "px",
				transform: `translateX(${position.offset}px)`
			} : {
				top: 0,
				height: position.size + "px",
				transform: `translateY(${position.offset}px)`
			},
			...indicatorProps.style
		}
	}) : null;
});
var CONTENT_NAME = "NavigationMenuContent";
var NavigationMenuContent = import_react.forwardRef((props, forwardedRef) => {
	const { forceMount, ...contentProps } = props;
	const context = useNavigationMenuContext(CONTENT_NAME, props.__scopeNavigationMenu);
	const itemContext = useNavigationMenuItemContext(CONTENT_NAME, props.__scopeNavigationMenu);
	const composedRefs = useComposedRefs(itemContext.contentRef, forwardedRef);
	const open = itemContext.value === context.value;
	const commonProps = {
		value: itemContext.value,
		triggerRef: itemContext.triggerRef,
		focusProxyRef: itemContext.focusProxyRef,
		wasEscapeCloseRef: itemContext.wasEscapeCloseRef,
		onContentFocusOutside: itemContext.onContentFocusOutside,
		onRootContentClose: itemContext.onRootContentClose,
		...contentProps
	};
	return !context.viewport ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Presence, {
		present: forceMount || open,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuContentImpl, {
			"data-state": getOpenState(open),
			...commonProps,
			ref: composedRefs,
			onPointerEnter: composeEventHandlers(props.onPointerEnter, context.onContentEnter),
			onPointerLeave: composeEventHandlers(props.onPointerLeave, whenMouse(context.onContentLeave)),
			style: {
				pointerEvents: !open && context.isRootMenu ? "none" : void 0,
				...commonProps.style
			}
		})
	}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ViewportContentMounter, {
		forceMount,
		...commonProps,
		ref: composedRefs
	});
});
NavigationMenuContent.displayName = CONTENT_NAME;
var ViewportContentMounter = import_react.forwardRef((props, forwardedRef) => {
	const { onViewportContentChange, onViewportContentRemove } = useNavigationMenuContext(CONTENT_NAME, props.__scopeNavigationMenu);
	useLayoutEffect2(() => {
		onViewportContentChange(props.value, {
			ref: forwardedRef,
			...props
		});
	}, [
		props,
		forwardedRef,
		onViewportContentChange
	]);
	useLayoutEffect2(() => {
		return () => onViewportContentRemove(props.value);
	}, [props.value, onViewportContentRemove]);
	return null;
});
var ROOT_CONTENT_DISMISS = "navigationMenu.rootContentDismiss";
var NavigationMenuContentImpl = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, value, triggerRef, focusProxyRef, wasEscapeCloseRef, onRootContentClose, onContentFocusOutside, ...contentProps } = props;
	const context = useNavigationMenuContext(CONTENT_NAME, __scopeNavigationMenu);
	const ref = import_react.useRef(null);
	const composedRefs = useComposedRefs(ref, forwardedRef);
	const triggerId = makeTriggerId(context.baseId, value);
	const contentId = makeContentId(context.baseId, value);
	const getItems = useCollection(__scopeNavigationMenu);
	const prevMotionAttributeRef = import_react.useRef(null);
	const { onItemDismiss } = context;
	import_react.useEffect(() => {
		const content = ref.current;
		if (context.isRootMenu && content) {
			const handleClose = () => {
				onItemDismiss();
				onRootContentClose();
				if (content.contains(document.activeElement)) triggerRef.current?.focus();
			};
			content.addEventListener(ROOT_CONTENT_DISMISS, handleClose);
			return () => content.removeEventListener(ROOT_CONTENT_DISMISS, handleClose);
		}
	}, [
		context.isRootMenu,
		props.value,
		triggerRef,
		onItemDismiss,
		onRootContentClose
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FocusGroup, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DismissableLayer, {
			id: contentId,
			"aria-labelledby": triggerId,
			"data-motion": import_react.useMemo(() => {
				const values = getItems().map((item) => item.value);
				if (context.dir === "rtl") values.reverse();
				const index = values.indexOf(context.value);
				const prevIndex = values.indexOf(context.previousValue);
				const isSelected = value === context.value;
				const wasSelected = prevIndex === values.indexOf(value);
				if (!isSelected && !wasSelected) return prevMotionAttributeRef.current;
				const attribute = (() => {
					if (index !== prevIndex) {
						if (isSelected && prevIndex !== -1) return index > prevIndex ? "from-end" : "from-start";
						if (wasSelected && index !== -1) return index > prevIndex ? "to-start" : "to-end";
					}
					return null;
				})();
				prevMotionAttributeRef.current = attribute;
				return attribute;
			}, [
				context.previousValue,
				context.value,
				context.dir,
				getItems,
				value
			]),
			"data-orientation": context.orientation,
			...contentProps,
			ref: composedRefs,
			disableOutsidePointerEvents: false,
			onDismiss: () => {
				const rootContentDismissEvent = new Event(ROOT_CONTENT_DISMISS, {
					bubbles: true,
					cancelable: true
				});
				ref.current?.dispatchEvent(rootContentDismissEvent);
			},
			onFocusOutside: composeEventHandlers(props.onFocusOutside, (event) => {
				onContentFocusOutside();
				const target = event.target;
				if (context.rootNavigationMenu?.contains(target)) event.preventDefault();
			}),
			onPointerDownOutside: composeEventHandlers(props.onPointerDownOutside, (event) => {
				const target = event.target;
				const isTrigger = getItems().some((item) => item.ref.current?.contains(target));
				const isRootViewport = context.isRootMenu && context.viewport?.contains(target);
				if (isTrigger || isRootViewport || !context.isRootMenu) event.preventDefault();
			}),
			onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
				const isMetaKey = event.altKey || event.ctrlKey || event.metaKey;
				if (event.key === "Tab" && !isMetaKey) {
					const candidates = getTabbableCandidates(event.currentTarget);
					const focusedElement = document.activeElement;
					const index = candidates.findIndex((candidate) => candidate === focusedElement);
					if (focusFirst(event.shiftKey ? candidates.slice(0, index).reverse() : candidates.slice(index + 1, candidates.length))) event.preventDefault();
					else focusProxyRef.current?.focus();
				}
			}),
			onEscapeKeyDown: composeEventHandlers(props.onEscapeKeyDown, (_event) => {
				wasEscapeCloseRef.current = true;
			})
		})
	});
});
var VIEWPORT_NAME = "NavigationMenuViewport";
var NavigationMenuViewport = import_react.forwardRef((props, forwardedRef) => {
	const { forceMount, ...viewportProps } = props;
	const context = useNavigationMenuContext(VIEWPORT_NAME, props.__scopeNavigationMenu);
	const open = Boolean(context.value);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Presence, {
		present: forceMount || open,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuViewportImpl, {
			...viewportProps,
			ref: forwardedRef
		})
	});
});
NavigationMenuViewport.displayName = VIEWPORT_NAME;
var NavigationMenuViewportImpl = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, children, ...viewportImplProps } = props;
	const context = useNavigationMenuContext(VIEWPORT_NAME, __scopeNavigationMenu);
	const composedRefs = useComposedRefs(forwardedRef, context.onViewportChange);
	const viewportContentContext = useViewportContentContext(CONTENT_NAME, props.__scopeNavigationMenu);
	const [size, setSize] = import_react.useState(null);
	const [content, setContent] = import_react.useState(null);
	const viewportWidth = size ? size?.width + "px" : void 0;
	const viewportHeight = size ? size?.height + "px" : void 0;
	const open = Boolean(context.value);
	const activeContentValue = open ? context.value : context.previousValue;
	const handleSizeChange = () => {
		if (content) setSize({
			width: content.offsetWidth,
			height: content.offsetHeight
		});
	};
	useResizeObserver(content, handleSizeChange);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
		"data-state": getOpenState(open),
		"data-orientation": context.orientation,
		...viewportImplProps,
		ref: composedRefs,
		style: {
			pointerEvents: !open && context.isRootMenu ? "none" : void 0,
			["--radix-navigation-menu-viewport-width"]: viewportWidth,
			["--radix-navigation-menu-viewport-height"]: viewportHeight,
			...viewportImplProps.style
		},
		onPointerEnter: composeEventHandlers(props.onPointerEnter, context.onContentEnter),
		onPointerLeave: composeEventHandlers(props.onPointerLeave, whenMouse(context.onContentLeave)),
		children: Array.from(viewportContentContext.items).map(([value, { ref, forceMount, ...props2 }]) => {
			const isActive = activeContentValue === value;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Presence, {
				present: forceMount || isActive,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavigationMenuContentImpl, {
					...props2,
					ref: composeRefs(ref, (node) => {
						if (isActive && node) setContent(node);
					})
				})
			}, value);
		})
	});
});
var FOCUS_GROUP_NAME = "FocusGroup";
var FocusGroup = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, ...groupProps } = props;
	const context = useNavigationMenuContext(FOCUS_GROUP_NAME, __scopeNavigationMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FocusGroupCollection.Provider, {
		scope: __scopeNavigationMenu,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FocusGroupCollection.Slot, {
			scope: __scopeNavigationMenu,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
				dir: context.dir,
				...groupProps,
				ref: forwardedRef
			})
		})
	});
});
var ARROW_KEYS = [
	"ArrowRight",
	"ArrowLeft",
	"ArrowUp",
	"ArrowDown"
];
var FOCUS_GROUP_ITEM_NAME = "FocusGroupItem";
var FocusGroupItem = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeNavigationMenu, ...groupProps } = props;
	const getItems = useFocusGroupCollection(__scopeNavigationMenu);
	const context = useNavigationMenuContext(FOCUS_GROUP_ITEM_NAME, __scopeNavigationMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FocusGroupCollection.ItemSlot, {
		scope: __scopeNavigationMenu,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.button, {
			...groupProps,
			ref: forwardedRef,
			onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
				if ([
					"Home",
					"End",
					...ARROW_KEYS
				].includes(event.key)) {
					let candidateNodes = getItems().map((item) => item.ref.current);
					if ([
						context.dir === "rtl" ? "ArrowRight" : "ArrowLeft",
						"ArrowUp",
						"End"
					].includes(event.key)) candidateNodes.reverse();
					if (ARROW_KEYS.includes(event.key)) {
						const currentIndex = candidateNodes.indexOf(event.currentTarget);
						candidateNodes = candidateNodes.slice(currentIndex + 1);
					}
					setTimeout(() => focusFirst(candidateNodes));
					event.preventDefault();
				}
			})
		})
	});
});
function getTabbableCandidates(container) {
	const nodes = [];
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, { acceptNode: (node) => {
		const isHiddenInput = node.tagName === "INPUT" && node.type === "hidden";
		if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
		return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
	} });
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
}
function focusFirst(candidates) {
	const previouslyFocusedElement = document.activeElement;
	return candidates.some((candidate) => {
		if (candidate === previouslyFocusedElement) return true;
		candidate.focus();
		return document.activeElement !== previouslyFocusedElement;
	});
}
function removeFromTabOrder(candidates) {
	candidates.forEach((candidate) => {
		candidate.dataset.tabindex = candidate.getAttribute("tabindex") || "";
		candidate.setAttribute("tabindex", "-1");
	});
	return () => {
		candidates.forEach((candidate) => {
			const prevTabIndex = candidate.dataset.tabindex;
			candidate.setAttribute("tabindex", prevTabIndex);
		});
	};
}
function useResizeObserver(element, onResize) {
	const handleResize = useCallbackRef(onResize);
	useLayoutEffect2(() => {
		let rAF = 0;
		if (element) {
			const resizeObserver = new ResizeObserver(() => {
				cancelAnimationFrame(rAF);
				rAF = window.requestAnimationFrame(handleResize);
			});
			resizeObserver.observe(element);
			return () => {
				window.cancelAnimationFrame(rAF);
				resizeObserver.unobserve(element);
			};
		}
	}, [element, handleResize]);
}
function getOpenState(open) {
	return open ? "open" : "closed";
}
function makeTriggerId(baseId, value) {
	return `${baseId}-trigger-${value}`;
}
function makeContentId(baseId, value) {
	return `${baseId}-content-${value}`;
}
function whenMouse(handler) {
	return (event) => event.pointerType === "mouse" ? handler(event) : void 0;
}
var Root2 = NavigationMenu;
var List = NavigationMenuList;
var Trigger = NavigationMenuTrigger;
var Link = NavigationMenuLink;
var Content = NavigationMenuContent;
var Viewport = NavigationMenuViewport;
//#endregion
export { Root2 as a, NavigationMenuItem as i, Link as n, Trigger as o, List as r, Viewport as s, Content as t };
