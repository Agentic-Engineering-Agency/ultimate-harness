globalThis.__nitro_main__ = import.meta.url;
import { a as toEventHandler, c as NodeResponse, i as defineLazyEventHandler, l as serve, n as HTTPError, r as defineHandler, t as H3Core } from "./_libs/h3+rou3+srvx.mjs";
import "./_libs/hookable.mjs";
import { t as getContext } from "./_libs/unctx.mjs";
import { i as withoutTrailingSlash, n as joinURL, r as withLeadingSlash, t as decodePath } from "./_libs/ufo.mjs";
import "node:async_hooks";
import { promises } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
//#region #nitro-vite-setup
function lazyService(loader) {
	let promise, mod;
	return { fetch(req) {
		if (mod) return mod.fetch(req);
		if (!promise) promise = loader().then((_mod) => mod = _mod.default || _mod);
		return promise.then((mod) => mod.fetch(req));
	} };
}
var services = { ["ssr"]: lazyService(() => import("./_ssr/ssr.mjs")) };
globalThis.__nitro_vite_envs__ = services;
getContext("nitro-app", {
	asyncContext: void 0,
	AsyncLocalStorage: void 0
});
//#endregion
//#region node_modules/nitro/dist/runtime/internal/error/prod.mjs
var errorHandler = (error, event) => {
	const res = defaultHandler(error, event);
	return new NodeResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
	const unhandled = error.unhandled ?? !HTTPError.isError(error);
	const { status = 500, statusText = "" } = unhandled ? {} : error;
	if (status === 404) {
		const url = event.url || new URL(event.req.url);
		const baseURL = "/";
		if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) return {
			status: 302,
			headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
		};
	}
	const headers = new Headers(unhandled ? {} : error.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	return {
		status,
		statusText,
		headers,
		body: {
			error: true,
			...unhandled ? {
				status,
				unhandled: true
			} : typeof error.toJSON === "function" ? error.toJSON() : {
				status,
				statusText,
				message: error.message
			}
		}
	};
}
//#endregion
//#region #nitro/virtual/error-handler
var errorHandlers = [errorHandler];
async function error_handler_default(error, event) {
	for (const handler of errorHandlers) try {
		const response = await handler(error, event, { defaultHandler });
		if (response) return response;
	} catch (error) {
		console.error(error);
	}
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/route-rules.mjs
var headers = ((m) => function headersRouteRule(event) {
	for (const [key, value] of Object.entries(m.options || {})) event.res.headers.set(key, value);
});
//#endregion
//#region #nitro/virtual/public-assets-data
var public_assets_data_default = {
	"/assets/_-CXz7OpII.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"358-7NPY4+kn4GPIshlBq8W+VWpJYYw\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 856,
		"path": "../public/assets/_-CXz7OpII.js"
	},
	"/assets/adopt-reject-defer-Cu0IKVDd.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"271c-ykUZ+b7oDxupFYIZMDH98HYkbbg\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 10012,
		"path": "../public/assets/adopt-reject-defer-Cu0IKVDd.js"
	},
	"/assets/adapter-codex-B3R3b_IC.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"bdf0-w15QrFJQHUOxlZP7UTy3wBF+tB4\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 48624,
		"path": "../public/assets/adapter-codex-B3R3b_IC.js"
	},
	"/assets/adapter-hermes-proxy-DpdVvwdT.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"c30f-2miEfhbaYGmxPeUQzC7I3hlobIM\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 49935,
		"path": "../public/assets/adapter-hermes-proxy-DpdVvwdT.js"
	},
	"/assets/algolia-CWDgB8aY.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"307-zLDxJJ1uRX7f59255T4R6InCKvw\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 775,
		"path": "../public/assets/algolia-CWDgB8aY.js"
	},
	"/assets/anthropic-via-omp-CBwZ68KD.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"596c-zV7dl07lRRuyt6EhrnfTEF8lTdU\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 22892,
		"path": "../public/assets/anthropic-via-omp-CBwZ68KD.js"
	},
	"/assets/app-CYZPb8dm.css": {
		"type": "text/css; charset=utf-8",
		"etag": "\"1435a-qE+emceIRC3OjhjvC0ZflbVO6ls\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 82778,
		"path": "../public/assets/app-CYZPb8dm.css"
	},
	"/assets/bmad-agent-map-D6xJGKe7.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1d61-G6GYdwti8kVzuP9imBY/cBXkxR8\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 7521,
		"path": "../public/assets/bmad-agent-map-D6xJGKe7.js"
	},
	"/assets/checks-CL6bGU0E.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"27f3-dXGZG/Qt0RMyzPdy+YfH/aMmf9Q\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 10227,
		"path": "../public/assets/checks-CL6bGU0E.js"
	},
	"/assets/codex-e2e-smoke-ixXtwH0J.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"6763-QJ3oZPyM7prF0qJaukkKE/Hlaeo\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 26467,
		"path": "../public/assets/codex-e2e-smoke-ixXtwH0J.js"
	},
	"/assets/audit-trail-DXGVx2_j.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"320e-xCywwyyGSBdWhmm82HpWX79PMRE\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 12814,
		"path": "../public/assets/audit-trail-DXGVx2_j.js"
	},
	"/assets/comparison-matrix-Bz29xImS.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"4205-24hrNhY8jJa3ZofoO323G8Uj/Jw\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 16901,
		"path": "../public/assets/comparison-matrix-Bz29xImS.js"
	},
	"/assets/fetch-Bxu2iOtu.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1be-+PuR3Hzb+Jn0JkA038qYxvdbY9o\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 446,
		"path": "../public/assets/fetch-Bxu2iOtu.js"
	},
	"/assets/entities-DV4er74o.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"201b-oVpZ1NWf2EfNyKUN5T4S8PvpKYw\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 8219,
		"path": "../public/assets/entities-DV4er74o.js"
	},
	"/assets/docs-cGzEjgqz.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"38cd-H9/ejb1L+tQnzKLDEecnRTWSZAs\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 14541,
		"path": "../public/assets/docs-cGzEjgqz.js"
	},
	"/assets/glossary-CP-9XJTw.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1dd9-/p64c5QUIjNvr2rySIojfjJrSGM\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 7641,
		"path": "../public/assets/glossary-CP-9XJTw.js"
	},
	"/assets/harness-artifacts-CQbH8yTL.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"2af2-dgAMcPQU8nx/zd9xcCQ5ykzN4+w\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 10994,
		"path": "../public/assets/harness-artifacts-CQbH8yTL.js"
	},
	"/assets/hermes-proxy-e2e-smoke-0ebUVue2.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"79cc-fA1iWvD+FLsxAtQGg9DM3yl6670\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 31180,
		"path": "../public/assets/hermes-proxy-e2e-smoke-0ebUVue2.js"
	},
	"/assets/hermes-proxy-setup-Y_BE3A4Y.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"9e47-hkvXe9FzLRVQ/YlryFz8cemFyYs\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 40519,
		"path": "../public/assets/hermes-proxy-setup-Y_BE3A4Y.js"
	},
	"/assets/inspiration-systems-CoG__PGu.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"449d-Te/EeiHsV6Q11Y/+YwTCCcfqQLc\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 17565,
		"path": "../public/assets/inspiration-systems-CoG__PGu.js"
	},
	"/assets/hermes-proxy-spike-Dfjjk4pe.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"133be-gSq03G0BR/EPL7C4FtTChu6YNrI\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 78782,
		"path": "../public/assets/hermes-proxy-spike-Dfjjk4pe.js"
	},
	"/assets/mission-to-sandbox-0ICB3gAc.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"9b4-9wvU0m+6dM4o7uQF6UH9/7NM0YM\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 2484,
		"path": "../public/assets/mission-to-sandbox-0ICB3gAc.js"
	},
	"/assets/mixedbread-BIUuOlSG.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"2eb1-VzMb1WLVgNl0TeNg7uOJQjaxTaQ\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 11953,
		"path": "../public/assets/mixedbread-BIUuOlSG.js"
	},
	"/assets/mission-packet-schema-C7jmPu_T.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"5916-ufBWNbONAdJmkqamkl6FIi1qO1U\"",
		"mtime": "2026-05-18T07:44:10.272Z",
		"size": 22806,
		"path": "../public/assets/mission-packet-schema-C7jmPu_T.js"
	},
	"/assets/index-Cj773Jxy.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"e024f-GMmKFPfst/wAXyRdy72PMdcOzbQ\"",
		"mtime": "2026-05-18T07:44:10.271Z",
		"size": 918095,
		"path": "../public/assets/index-Cj773Jxy.js"
	},
	"/assets/mvp-scope-Bkgm6tPh.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1ad4-XwZPpUEaXHwjypjkA3dpN1WVhuU\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 6868,
		"path": "../public/assets/mvp-scope-Bkgm6tPh.js"
	},
	"/assets/non-goals-C4plm5St.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"b5f-tDAtyxv+SXqxa1489fasOX8gVVE\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 2911,
		"path": "../public/assets/non-goals-C4plm5St.js"
	},
	"/assets/orama-cloud-D-WSbEM1.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"495-UtaeILQ3SYXhs7NyDXex8cpcLPw\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 1173,
		"path": "../public/assets/orama-cloud-D-WSbEM1.js"
	},
	"/assets/orama-static-DWFHZoMN.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"3029-U+OEFyPil/lLWrZRLTKMXER77n0\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 12329,
		"path": "../public/assets/orama-static-DWFHZoMN.js"
	},
	"/assets/orama-cloud-legacy-CUEKdyFy.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"45c-5oARr2IjkTV91Wq9tIKv9h89R4A\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 1116,
		"path": "../public/assets/orama-cloud-legacy-CUEKdyFy.js"
	},
	"/assets/overview-B8JsbxFq.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"2646-4t8mESeMHr+J4MocxAOzoCeMV58\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 9798,
		"path": "../public/assets/overview-B8JsbxFq.js"
	},
	"/assets/overview-Bd3YQsiR.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"15e8-X2uLRx+HJqtTtzi7DTY0Z4v0cZA\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 5608,
		"path": "../public/assets/overview-Bd3YQsiR.js"
	},
	"/assets/prd-Xn3A5O2G.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"2c23-Unw+tzqKjx78QI3PZlwmQa8O6Cs\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 11299,
		"path": "../public/assets/prd-Xn3A5O2G.js"
	},
	"/assets/remove-undefined-CTqT55E9-DGK3h9Yj.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"cc-88aNR5JCZ2HMYd906fGA/TYRfJk\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 204,
		"path": "../public/assets/remove-undefined-CTqT55E9-DGK3h9Yj.js"
	},
	"/assets/research-to-spec-Ce7D-cjZ.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"f02-5NwDkkwAsKxaCYe7yfIZdIxHa/U\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 3842,
		"path": "../public/assets/research-to-spec-Ce7D-cjZ.js"
	},
	"/assets/plan-to-mission-DKsw-MkN.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"a78-GTXx07Q0BtA6PTLMx0u5/Ek83Sg\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 2680,
		"path": "../public/assets/plan-to-mission-DKsw-MkN.js"
	},
	"/assets/roadmap-PtNPydpm.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"8bfb-F9nUnkWuebDFHZx3L9f8pk6cZ60\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 35835,
		"path": "../public/assets/roadmap-PtNPydpm.js"
	},
	"/assets/runtime-adapter-contract-CoxpslHC.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"8c94-Lhe5cSNxR23KSLzs4pWhCX8y6Jo\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 35988,
		"path": "../public/assets/runtime-adapter-contract-CoxpslHC.js"
	},
	"/assets/sandbox-agentfs-Dw1hTqDF.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"12771-/9TAYWMLx6Y9Y6AzvDxk9KJMtwM\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 75633,
		"path": "../public/assets/sandbox-agentfs-Dw1hTqDF.js"
	},
	"/assets/review-gates-Dq6DiGex.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1419-9+NTfHunNnmwwMynxgMphpxAAVY\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 5145,
		"path": "../public/assets/review-gates-Dq6DiGex.js"
	},
	"/assets/sandboxing-DN-xjuQr.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"274d-Hj/4C+siFuUr3lCf7mTADNZEypw\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 10061,
		"path": "../public/assets/sandboxing-DN-xjuQr.js"
	},
	"/assets/personas-BV-j87pg.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"f82-bJNpX2IU8J1hqyW3LB+lrqPp4Qo\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 3970,
		"path": "../public/assets/personas-BV-j87pg.js"
	},
	"/assets/search-dhyJJjoq.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"3e9-hU9Wxi8Q5rJPxJpdf58v28Jesq0\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 1001,
		"path": "../public/assets/search-dhyJJjoq.js"
	},
	"/assets/search-default-CSkyeVRv.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"3f6-VxK3iebx+hpc62VFIr+MCsn+Lt4\"",
		"mtime": "2026-05-18T07:44:10.273Z",
		"size": 1014,
		"path": "../public/assets/search-default-CSkyeVRv.js"
	},
	"/assets/skill-format-DzEziIm-.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"82bc-w0p0SIHoeJQ8F80ePyw5mcSnS40\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 33468,
		"path": "../public/assets/skill-format-DzEziIm-.js"
	},
	"/assets/spec-to-plan-BYWy690t.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"c51-mviuHzqGDX8ESgCn0tO+oehMyPk\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 3153,
		"path": "../public/assets/spec-to-plan-BYWy690t.js"
	},
	"/assets/strategy-CC71Q-A3.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1164-cbuzWUOQ7iEwlZdV8SmHyryLjaM\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 4452,
		"path": "../public/assets/strategy-CC71Q-A3.js"
	},
	"/assets/tui-Bry8i4EP.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"c381-bSqO+nFpV24pl2rng0Ehogi63aA\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 50049,
		"path": "../public/assets/tui-Bry8i4EP.js"
	},
	"/assets/tui-framework-q5z7w9x7.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"122e7-b5f/CV2wT4OTkrMOpW50zyFJ6M4\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 74471,
		"path": "../public/assets/tui-framework-q5z7w9x7.js"
	},
	"/assets/using-the-tui-yMli2Xw1.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"e3b9-trLCxJm1KR9qYfFA+G7+2f6E+Ks\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 58297,
		"path": "../public/assets/using-the-tui-yMli2Xw1.js"
	},
	"/assets/verification-and-promotion-CITmEJ5U.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"466f-tgyiYIcgAvGob4W8x+tH8Y+jdu0\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 18031,
		"path": "../public/assets/verification-and-promotion-CITmEJ5U.js"
	},
	"/assets/verify-review-promote-K1uhtQLA.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"a1b-89/IMlD4vAO+qjYIwA/xPBlE8RQ\"",
		"mtime": "2026-05-18T07:44:10.274Z",
		"size": 2587,
		"path": "../public/assets/verify-review-promote-K1uhtQLA.js"
	}
};
//#endregion
//#region #nitro/virtual/public-assets-node
function readAsset(id) {
	const serverDir = dirname(fileURLToPath(globalThis.__nitro_main__));
	return promises.readFile(resolve(serverDir, public_assets_data_default[id].path));
}
//#endregion
//#region #nitro/virtual/public-assets
var publicAssetBases = {};
function isPublicAssetURL(id = "") {
	if (public_assets_data_default[id]) return true;
	for (const base in publicAssetBases) if (id.startsWith(base)) return true;
	return false;
}
function getAsset(id) {
	return public_assets_data_default[id];
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/static.mjs
var METHODS = new Set(["HEAD", "GET"]);
var EncodingMap = {
	gzip: ".gz",
	br: ".br",
	zstd: ".zst"
};
var static_default = defineHandler((event) => {
	if (event.req.method && !METHODS.has(event.req.method)) return;
	let id = decodePath(withLeadingSlash(withoutTrailingSlash(event.url.pathname)));
	let asset;
	const encodings = [...(event.req.headers.get("accept-encoding") || "").split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(), ""];
	for (const encoding of encodings) for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
		const _asset = getAsset(_id);
		if (_asset) {
			asset = _asset;
			id = _id;
			break;
		}
	}
	if (!asset) {
		if (isPublicAssetURL(id)) {
			event.res.headers.delete("Cache-Control");
			throw new HTTPError({ status: 404 });
		}
		return;
	}
	if (encodings.length > 1) event.res.headers.append("Vary", "Accept-Encoding");
	if (event.req.headers.get("if-none-match") === asset.etag) {
		event.res.status = 304;
		event.res.statusText = "Not Modified";
		return "";
	}
	const ifModifiedSinceH = event.req.headers.get("if-modified-since");
	const mtimeDate = new Date(asset.mtime);
	if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
		event.res.status = 304;
		event.res.statusText = "Not Modified";
		return "";
	}
	if (asset.type) event.res.headers.set("Content-Type", asset.type);
	if (asset.etag && !event.res.headers.has("ETag")) event.res.headers.set("ETag", asset.etag);
	if (asset.mtime && !event.res.headers.has("Last-Modified")) event.res.headers.set("Last-Modified", mtimeDate.toUTCString());
	if (asset.encoding && !event.res.headers.has("Content-Encoding")) event.res.headers.set("Content-Encoding", asset.encoding);
	if (asset.size > 0 && !event.res.headers.has("Content-Length")) event.res.headers.set("Content-Length", asset.size.toString());
	return readAsset(id);
});
//#endregion
//#region #nitro/virtual/routing
var findRouteRules = /* @__PURE__ */ (() => {
	const $0 = [{
		name: "headers",
		route: "/assets/**",
		handler: headers,
		options: { "cache-control": "public, max-age=31536000, immutable" }
	}];
	return (m, p) => {
		let r = [];
		if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1) || "/";
		let s = p.split("/");
		if (s.length > 1) {
			if (s[1] === "assets") r.unshift({
				data: $0,
				params: { "_": s.slice(2).join("/") }
			});
		}
		return r;
	};
})();
var _lazy_z863TM = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
var findRoute = /* @__PURE__ */ (() => {
	const data = {
		route: "/**",
		handler: _lazy_z863TM
	};
	return ((_m, p) => {
		return {
			data,
			params: { "_": p.slice(1) }
		};
	});
})();
var globalMiddleware = [toEventHandler(static_default)].filter(Boolean);
//#endregion
//#region node_modules/nitro/dist/runtime/internal/app.mjs
var APP_ID = "default";
function useNitroApp() {
	let instance = useNitroApp._instance;
	if (instance) return instance;
	instance = useNitroApp._instance = createNitroApp();
	globalThis.__nitro__ = globalThis.__nitro__ || {};
	globalThis.__nitro__[APP_ID] = instance;
	return instance;
}
function createNitroApp() {
	const hooks = void 0;
	const captureError = (error, errorCtx) => {
		if (errorCtx?.event) {
			const errors = errorCtx.event.req.context?.nitro?.errors;
			if (errors) errors.push({
				error,
				context: errorCtx
			});
		}
	};
	const h3App = createH3App({ onError(error, event) {
		return error_handler_default(error, event);
	} });
	let appHandler = (req) => {
		req.context ||= {};
		req.context.nitro = req.context.nitro || { errors: [] };
		return h3App.fetch(req);
	};
	return {
		fetch: appHandler,
		h3: h3App,
		hooks,
		captureError
	};
}
function createH3App(config) {
	const h3App = new H3Core(config);
	h3App["~findRoute"] = (event) => findRoute(event.req.method, event.url.pathname);
	h3App["~middleware"].push(...globalMiddleware);
	h3App["~getMiddleware"] = (event, route) => {
		const pathname = event.url.pathname;
		const method = event.req.method;
		const middleware = [];
		{
			const routeRules = getRouteRules(method, pathname);
			event.context.routeRules = routeRules?.routeRules;
			if (routeRules?.routeRuleMiddleware.length) middleware.push(...routeRules.routeRuleMiddleware);
		}
		middleware.push(...h3App["~middleware"]);
		if (route?.data?.middleware?.length) middleware.push(...route.data.middleware);
		return middleware;
	};
	return h3App;
}
function getRouteRules(method, pathname) {
	const m = findRouteRules(method, pathname);
	if (!m?.length) return { routeRuleMiddleware: [] };
	const routeRules = {};
	for (const layer of m) for (const rule of layer.data) {
		const currentRule = routeRules[rule.name];
		if (currentRule) {
			if (rule.options === false) {
				delete routeRules[rule.name];
				continue;
			}
			if (typeof currentRule.options === "object" && typeof rule.options === "object") currentRule.options = {
				...currentRule.options,
				...rule.options
			};
			else currentRule.options = rule.options;
			currentRule.route = rule.route;
			currentRule.params = {
				...currentRule.params,
				...layer.params
			};
		} else if (rule.options !== false) routeRules[rule.name] = {
			...rule,
			params: layer.params
		};
	}
	const middleware = [];
	const orderedRules = Object.values(routeRules).sort((a, b) => (a.handler?.order || 0) - (b.handler?.order || 0));
	for (const rule of orderedRules) {
		if (rule.options === false || !rule.handler) continue;
		middleware.push(rule.handler(rule));
	}
	return {
		routeRules,
		routeRuleMiddleware: middleware
	};
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/error/hooks.mjs
function _captureError(error, type) {
	console.error(`[${type}]`, error);
	useNitroApp().captureError?.(error, { tags: [type] });
}
function trapUnhandledErrors() {
	process.on("unhandledRejection", (error) => _captureError(error, "unhandledRejection"));
	process.on("uncaughtException", (error) => _captureError(error, "uncaughtException"));
}
//#endregion
//#region #nitro/virtual/tracing
var tracingSrvxPlugins = [];
//#endregion
//#region node_modules/nitro/dist/presets/node/runtime/node-server.mjs
var _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
var port = Number.isNaN(_parsedPort) ? 3e3 : _parsedPort;
var host = process.env.NITRO_HOST || process.env.HOST;
var cert = process.env.NITRO_SSL_CERT;
var key = process.env.NITRO_SSL_KEY;
var nitroApp = useNitroApp();
serve({
	port,
	hostname: host,
	tls: cert && key ? {
		cert,
		key
	} : void 0,
	fetch: nitroApp.fetch,
	plugins: [...tracingSrvxPlugins]
});
trapUnhandledErrors();
var node_server_default = {};
//#endregion
export { node_server_default as default };
