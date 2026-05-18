import { o as create, t as load } from "../_libs/orama__orama.mjs";
import { n as searchSimple, t as searchAdvanced } from "./advanced-BCAHgGV0-ub9H9D0l.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/orama-static-69G95pm8.js
var cache = /* @__PURE__ */ new Map();
async function loadDB(from, initOrama = (locale) => create({
	schema: { _: "string" },
	language: locale
})) {
	const res = await fetch(from);
	if (!res.ok) throw new Error(`failed to fetch exported search indexes from ${from}, make sure the search database is exported and available for client.`);
	const data = await res.json();
	const dbs = /* @__PURE__ */ new Map();
	if (data.type === "i18n") await Promise.all(Object.entries(data.data).map(async ([k, v]) => {
		const db = await initOrama(k);
		load(db, v);
		dbs.set(k, {
			type: v.type,
			db
		});
	}));
	else {
		const db = await initOrama();
		load(db, data);
		dbs.set("", {
			type: data.type,
			db
		});
	}
	return dbs;
}
function getDBCached(options) {
	const { from = "/api/search", initOrama } = options;
	const cacheKey = from;
	const cached = cache.get(cacheKey);
	if (cached) return cached;
	const result = loadDB(from, initOrama);
	cache.set(cacheKey, result);
	return result;
}
function oramaStaticClient(options) {
	const { tag, locale, search } = options;
	return {
		deps: [tag, locale],
		async search(query) {
			const dbs = await getDBCached(options);
			let db = dbs.get(locale ?? "");
			if (!db) {
				console.warn(`failed to find search data for "${locale}", available: ${Array.from(dbs.keys())}.`);
				db = dbs.values().next().value;
			}
			if (!db) return [];
			if (db.type === "simple") return searchSimple(db, query, search);
			return searchAdvanced(db.db, query, tag, search);
		}
	};
}
//#endregion
export { oramaStaticClient };
