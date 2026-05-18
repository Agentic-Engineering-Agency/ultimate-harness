import { t as r } from "./compute-scroll-into-view.mjs";
//#region node_modules/scroll-into-view-if-needed/dist/index.js
var o = (t) => !1 === t ? {
	block: "end",
	inline: "nearest"
} : ((t) => t === Object(t) && 0 !== Object.keys(t).length)(t) ? t : {
	block: "start",
	inline: "nearest"
};
function e(e, r$1) {
	if (!e.isConnected || !((t) => {
		let o = t;
		for (; o && o.parentNode;) {
			if (o.parentNode === document) return !0;
			o = o.parentNode instanceof ShadowRoot ? o.parentNode.host : o.parentNode;
		}
		return !1;
	})(e)) return;
	const n = ((t) => {
		const o = window.getComputedStyle(t);
		return {
			top: parseFloat(o.scrollMarginTop) || 0,
			right: parseFloat(o.scrollMarginRight) || 0,
			bottom: parseFloat(o.scrollMarginBottom) || 0,
			left: parseFloat(o.scrollMarginLeft) || 0
		};
	})(e);
	if (((t) => "object" == typeof t && "function" == typeof t.behavior)(r$1)) return r$1.behavior(r(e, r$1));
	const l = "boolean" == typeof r$1 || null == r$1 ? void 0 : r$1.behavior;
	for (const { el: a, top: i, left: s } of r(e, o(r$1))) {
		const t = i - n.top + n.bottom, o = s - n.left + n.right;
		a.scroll({
			top: t,
			left: o,
			behavior: l
		});
	}
}
//#endregion
export { e as t };
