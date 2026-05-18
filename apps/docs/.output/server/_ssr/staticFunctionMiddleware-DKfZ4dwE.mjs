import { d as Pu, u as Iu } from "../_libs/@tanstack/router-core+[...].mjs";
import { d as getDefaultSerovalPlugins, s as createMiddleware } from "./esm-DaX-Y_xv.mjs";
import path from "node:path";
import fs from "node:fs/promises";
//#region node_modules/.nitro/vite/services/ssr/assets/staticFunctionMiddleware-DKfZ4dwE.js
/**
* normalize URL into the Fumadocs standard form (`/slug-1/slug-2`).
*
* This includes URLs with trailing slashes.
*/
function normalizeUrl(url) {
	if (url.startsWith("http://") || url.startsWith("https://")) return url;
	if (!url.startsWith("/")) url = "/" + url;
	if (url.length > 1 && url.endsWith("/")) url = url.slice(0, -1);
	return url;
}
/**
* Search the path of a node in the tree matched by the matcher.
*
* @returns The path to the target node (from starting root), or null if the page doesn't exist
*/
function findPath(nodes, matcher, options = {}) {
	const { includeSeparator = true } = options;
	function run(nodes) {
		let separator;
		for (const node of nodes) {
			if (matcher(node)) {
				const items = [];
				if (separator) items.push(separator);
				items.push(node);
				return items;
			}
			if (node.type === "separator" && includeSeparator) {
				separator = node;
				continue;
			}
			if (node.type === "folder") {
				const items = node.index && matcher(node.index) ? [node.index] : run(node.children);
				if (items) {
					items.unshift(node);
					if (separator) items.unshift(separator);
					return items;
				}
			}
		}
	}
	return run(nodes) ?? null;
}
var VisitBreak = Symbol("VisitBreak");
/**
* Perform a depth-first search on page tree visiting every node.
*
* @param root - the root of page tree to visit.
* @param visitor - function to receive nodes, return `skip` to skip the children of current node, `break` to stop the search entirely.
*/
function visit(root, visitor) {
	function onNode(node, parent) {
		const result = visitor(node, parent);
		switch (result) {
			case "skip": return node;
			case "break": throw VisitBreak;
			default: if (result) node = result;
		}
		if ("index" in node && node.index) node.index = onNode(node.index, node);
		if ("fallback" in node && node.fallback) node.fallback = onNode(node.fallback, node);
		if ("children" in node) for (let i = 0; i < node.children.length; i++) node.children[i] = onNode(node.children[i], node);
		return node;
	}
	try {
		return onNode(root);
	} catch (e) {
		if (e === VisitBreak) return root;
		throw e;
	}
}
var docsRoute = "/docs";
var gitConfig = {
	user: "fuma-nama",
	repo: "fumadocs",
	branch: "main"
};
/**
* This is a simple hash function for generating a hash from a string to make the filenames shorter.
*
* It is not cryptographically secure (as its using SHA-1) and should not be used for any security purposes.
*
* It is only used to generate a hash for the static cache filenames.
*
* @param message - The input string to hash.
* @returns A promise that resolves to the SHA-1 hash of the input string in hexadecimal format.
*
* @example
* ```typescript
* const hash = await sha1Hash("hello");
* console.log(hash); // Outputs the SHA-1 hash of "hello" -> "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"
* ```
*/
async function sha1Hash(message) {
	const msgBuffer = new TextEncoder().encode(message);
	const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
	return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var getStaticCacheUrl = async (opts) => {
	return `/__tsr/staticServerFnCache/${await sha1Hash(`${opts.functionId}__${opts.hash}`)}.json`;
};
var jsonToFilenameSafeString = (json) => {
	const sortedKeysReplacer = (key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort().reduce((acc, curr) => {
		acc[curr] = value[curr];
		return acc;
	}, {}) : value;
	return JSON.stringify(json ?? "", sortedKeysReplacer).replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_");
};
var staticClientCache = typeof document !== "undefined" ? /* @__PURE__ */ new Map() : null;
async function addItemToCache({ functionId, data, response }) {
	{
		const url = await getStaticCacheUrl({
			functionId,
			hash: jsonToFilenameSafeString(data)
		});
		const clientUrl = process.env.TSS_CLIENT_OUTPUT_DIR;
		const filePath = path.join(clientUrl, url);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		const stringifiedResult = JSON.stringify(await Iu({
			result: response.result,
			context: response.context.sendContext
		}, { plugins: getDefaultSerovalPlugins() }));
		await fs.writeFile(filePath, stringifiedResult, "utf-8");
	}
}
var fetchItem = async ({ data, functionId }) => {
	const url = await getStaticCacheUrl({
		functionId,
		hash: jsonToFilenameSafeString(data)
	});
	let result = staticClientCache?.get(url);
	result = await fetch(url, { method: "GET" }).then((r) => r.json()).then((d) => Pu(d, { plugins: getDefaultSerovalPlugins() }));
	return result;
};
var staticFunctionMiddleware = createMiddleware({ type: "function" }).client(async (ctx) => {
	if (typeof document !== "undefined") {
		const response = await fetchItem({
			functionId: ctx.serverFnMeta.id,
			data: ctx.data
		});
		if (response) return {
			result: response.result,
			context: {
				...ctx.context,
				...response.context
			}
		};
	}
	return ctx.next();
}).server(async (ctx) => {
	const response = await ctx.next();
	if (process.env.TSS_CLIENT_OUTPUT_DIR) await addItemToCache({
		functionId: ctx.serverFnMeta.id,
		response: {
			result: response.result,
			context: ctx
		},
		data: ctx.data
	});
	return response;
});
//#endregion
export { staticFunctionMiddleware as a, normalizeUrl as i, findPath as n, visit as o, gitConfig as r, docsRoute as t };
