import { i as __toESM } from "../_runtime.mjs";
import { n as adapter_codex_exports } from "./adapter-codex-BXv3B9gM.mjs";
import { n as adapter_hermes_proxy_exports } from "./adapter-hermes-proxy-C3bDnLfR.mjs";
import { n as entities_exports } from "./entities-BkbmqX-g.mjs";
import { r as harness_artifacts_exports } from "./harness-artifacts-BFtyg5gA.mjs";
import { r as hermes_proxy_spike_exports } from "./hermes-proxy-spike-_7jmBuXG.mjs";
import { r as mission_packet_schema_exports } from "./mission-packet-schema-MWta_6LQ.mjs";
import { r as overview_exports } from "./overview-hZ9n0sfi.mjs";
import { r as runtime_adapter_contract_exports } from "./runtime-adapter-contract-DNXhJB-v.mjs";
import { r as sandbox_agentfs_exports } from "./sandbox-agentfs-WZhi9SnI.mjs";
import { r as sandboxing_exports } from "./sandboxing-X8zlZ9vA.mjs";
import { r as skill_format_exports } from "./skill-format-cfBs9xXx.mjs";
import { a as tui_exports } from "./tui-CNLBYUTn.mjs";
import { a as verification_and_promotion_exports } from "./verification-and-promotion-DLB5qaTJ.mjs";
import { r as glossary_exports } from "./glossary-CXlI0Pq7.mjs";
import { n as docs_exports } from "./docs-D_QrTfOA.mjs";
import { r as mvp_scope_exports } from "./mvp-scope-C3lRs3DI.mjs";
import { r as non_goals_exports } from "./non-goals-Dy80I3A7.mjs";
import { r as personas_exports } from "./personas-Bbf6EqWV.mjs";
import { r as prd_exports } from "./prd-BBao1S-d.mjs";
import { n as adopt_reject_defer_exports } from "./adopt-reject-defer-CnWkR4c4.mjs";
import { n as comparison_matrix_exports } from "./comparison-matrix-CsEsVUfq.mjs";
import { r as inspiration_systems_exports } from "./inspiration-systems-DpY8Qnlc.mjs";
import { a as tui_framework_exports } from "./tui-framework-B5qBSfYf.mjs";
import { r as roadmap_exports } from "./roadmap-CAT3qeki.mjs";
import { n as anthropic_via_omp_exports } from "./anthropic-via-omp-Dj_-pGXT.mjs";
import { n as codex_e2e_smoke_exports } from "./codex-e2e-smoke-C4jYHG15.mjs";
import { r as hermes_proxy_e2e_smoke_exports } from "./hermes-proxy-e2e-smoke-4Lg2v9xj.mjs";
import { r as hermes_proxy_setup_exports } from "./hermes-proxy-setup-Dk9qRRRP.mjs";
import { a as using_the_tui_exports } from "./using-the-tui-M43NHI9g.mjs";
import { n as audit_trail_exports } from "./audit-trail--pH4_P2F.mjs";
import { n as checks_exports } from "./checks-oj2BOFhw.mjs";
import { r as review_gates_exports } from "./review-gates-DTmLWyUr.mjs";
import { r as strategy_exports } from "./strategy-hBtDQ2Qt.mjs";
import { n as bmad_agent_map_exports } from "./bmad-agent-map-B4EtvAfv.mjs";
import { r as mission_to_sandbox_exports } from "./mission-to-sandbox-D9XczeXS.mjs";
import { r as overview_exports$1 } from "./overview-C8CdrjAL.mjs";
import { r as plan_to_mission_exports } from "./plan-to-mission-MIArREpU.mjs";
import { r as research_to_spec_exports } from "./research-to-spec-CUsdEBqa.mjs";
import { r as spec_to_plan_exports } from "./spec-to-plan-9BM3KnPK.mjs";
import { a as verify_review_promote_exports } from "./verify-review-promote-DVHBKEoZ.mjs";
import { i as normalizeUrl, o as visit, t as docsRoute } from "./staticFunctionMiddleware-DKfZ4dwE.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { t as icons_exports } from "../_libs/lucide-react.mjs";
import * as path$1 from "node:path";
import path from "node:path";
//#region node_modules/.nitro/vite/services/ssr/assets/source-Ddd-zLGf.js
var import_react = /* @__PURE__ */ __toESM(require_react());
function basename(path, ext) {
	const idx = path.lastIndexOf("/");
	return path.substring(idx === -1 ? 0 : idx + 1, ext ? path.length - ext.length : path.length);
}
function extname(path) {
	for (let i = path.length - 1; i >= 0; i--) {
		const c = path[i];
		if (c === ".") return path.substring(i);
		if (c === "/") return "";
	}
	return "";
}
function dirname$1(path) {
	const idx = path.lastIndexOf("/");
	if (idx === -1) return "";
	return path.substring(0, idx);
}
/**
* Split path into segments, trailing/leading slashes are removed
*/
function splitPath(path) {
	return path.split("/").filter((p) => p.length > 0);
}
/**
* Resolve paths, slashes within the path will be ignored
* @param paths - Paths to join
* @example
* ```
* ['a','b'] // 'a/b'
* ['/a'] // 'a'
* ['a', '/b'] // 'a/b'
* ['a', '../b/c'] // 'b/c'
* ```
*/
function joinPath(...paths) {
	const out = [];
	const parsed = paths.flatMap((path) => path.split("/"));
	for (const seg of parsed) switch (seg) {
		case "..":
			out.pop();
			break;
		case "":
		case ".": break;
		default: out.push(seg);
	}
	return out.join("/");
}
function slash(path) {
	if (path.startsWith("\\\\?\\")) return path;
	return path.replaceAll("\\", "/");
}
/**
* Generate slugs for pages if missing
*/
function slugsPlugin(slugFn) {
	function isIndex(file) {
		return basename(file, extname(file)) === "index";
	}
	return {
		name: "fumadocs:slugs",
		transformStorage({ storage }) {
			const indexFiles = [];
			const taken = /* @__PURE__ */ new Set();
			for (const path of storage.getFiles()) {
				const file = storage.read(path);
				if (!file || file.format !== "page" || file.slugs) continue;
				const customSlugs = slugFn?.(file);
				if (customSlugs === void 0 && isIndex(path)) {
					indexFiles.push(path);
					continue;
				}
				file.slugs = customSlugs ?? getSlugs(path);
				const key = file.slugs.join("/");
				if (taken.has(key)) throw new Error(`Duplicated slugs: ${key}`);
				taken.add(key);
			}
			for (const path of indexFiles) {
				const file = storage.read(path);
				if (file?.format !== "page") continue;
				file.slugs = getSlugs(path);
				if (taken.has(file.slugs.join("/"))) file.slugs.push("index");
			}
		}
	};
}
var GroupRegex = /^\(.+\)$/;
/**
* Convert file path into slugs, also encode non-ASCII characters, so they can work in pathname
*/
function getSlugs(file) {
	const dir = dirname$1(file);
	const name = basename(file, extname(file));
	const slugs = [];
	for (const seg of dir.split("/")) if (seg.length > 0 && !GroupRegex.test(seg)) slugs.push(encodeURI(seg));
	if (GroupRegex.test(name)) throw new Error(`Cannot use folder group in file names: ${file}`);
	if (name !== "index") slugs.push(encodeURI(name));
	return slugs;
}
function iconPlugin(resolveIcon) {
	function replaceIcon(node) {
		if (node.icon === void 0 || typeof node.icon === "string") node.icon = resolveIcon(node.icon);
		return node;
	}
	return {
		name: "fumadocs:icon",
		transformPageTree: {
			file: replaceIcon,
			folder: replaceIcon,
			separator: replaceIcon
		}
	};
}
/**
* In memory file system.
*/
var FileSystem = class {
	constructor(inherit) {
		this.files = /* @__PURE__ */ new Map();
		this.folders = /* @__PURE__ */ new Map();
		if (inherit) {
			for (const [k, v] of inherit.folders) this.folders.set(k, v);
			for (const [k, v] of inherit.files) this.files.set(k, v);
		} else this.folders.set("", []);
	}
	read(path) {
		return this.files.get(path);
	}
	/**
	* get the direct children of folder (in virtual file path)
	*/
	readDir(path) {
		return this.folders.get(path);
	}
	write(path, file) {
		if (!this.files.has(path)) {
			const dir = dirname$1(path);
			this.makeDir(dir);
			this.readDir(dir)?.push(path);
		}
		this.files.set(path, file);
	}
	/**
	* Delete files at specified path.
	*
	* @param path - the target path.
	* @param [recursive=false] - if set to `true`, it will also delete directories.
	*/
	delete(path, recursive = false) {
		if (this.files.delete(path)) return true;
		if (recursive) {
			const folder = this.folders.get(path);
			if (!folder) return false;
			this.folders.delete(path);
			for (const child of folder) this.delete(child);
			return true;
		}
		return false;
	}
	getFiles() {
		return Array.from(this.files.keys());
	}
	makeDir(path) {
		const cur = [];
		let parentPath = "";
		for (const seg of path.split("/")) {
			cur.push(seg);
			const curPath = cur.join("/");
			if (!this.folders.has(curPath)) {
				this.folders.set(curPath, []);
				this.folders.get(parentPath).push(curPath);
			}
			parentPath = curPath;
		}
	}
};
function isStaticSource(s) {
	return "files" in s && Array.isArray(s.files);
}
var EmptyLang = Symbol();
/**
* convert input files into virtual file system.
*
* in the storage, locale codes are removed from file paths, hence the same file will have same file paths in every storage.
*/
function createContentStorageBuilder(loaderConfig) {
	const { input, plugins, i18n } = loaderConfig;
	let parser;
	if (!i18n) parser = (path) => [path];
	else if (i18n.parser === "dir") {
		const langSet = new Set(i18n.languages);
		parser = (path) => {
			const [locale, ...segs] = path.split("/");
			if (!locale || segs.length === 0) return [path];
			if (langSet.has(locale)) return [segs.join("/"), locale];
			if (locale === "$") return [segs.join("/"), i18n.languages];
			return [path];
		};
	} else {
		const langSet = new Set(i18n.languages);
		parser = (path) => {
			const segs = path.split("/");
			const base = segs.pop();
			if (!base) return [path];
			const parts = base.split(".");
			if (parts.length < 3) return [path];
			const [locale] = parts.splice(parts.length - 2, 1);
			segs.push(parts.join("."));
			if (langSet.has(locale)) return [segs.join("/"), locale];
			if (locale === "$") return [segs.join("/"), i18n.languages];
			return [path];
		};
	}
	const fileMap = /* @__PURE__ */ new Map();
	function scan(type, source) {
		for (const inputFile of source.files) {
			let file;
			if (inputFile.type === "page") file = {
				format: "page",
				type,
				path: normalizePath(inputFile.path),
				slugs: inputFile.slugs,
				data: inputFile.data,
				absolutePath: inputFile.absolutePath
			};
			else file = {
				format: "meta",
				type,
				path: normalizePath(inputFile.path),
				absolutePath: inputFile.absolutePath,
				data: inputFile.data
			};
			const [storageKey, locale = i18n ? i18n.defaultLanguage : EmptyLang] = parser(file.path);
			const entry = [storageKey, file];
			if (Array.isArray(locale)) for (const item of locale) pushMapList(fileMap, item, entry);
			else pushMapList(fileMap, locale, entry);
		}
	}
	if (isStaticSource(input)) scan(void 0, input);
	else for (const k in input) scan(k, input[k]);
	function makeStorage(locale, inherit) {
		const storage = new FileSystem(inherit);
		for (const [storageKey, file] of fileMap.get(locale) ?? []) storage.write(storageKey, file);
		const context = { storage };
		for (const plugin of plugins) plugin.transformStorage?.(context);
		return storage;
	}
	return {
		i18n() {
			const storages = {};
			if (!i18n) return storages;
			const fallbackLang = i18n.fallbackLanguage !== null ? i18n.fallbackLanguage ?? i18n.defaultLanguage : null;
			function scan(lang) {
				if (storages[lang]) return storages[lang];
				return storages[lang] = makeStorage(lang, fallbackLang && fallbackLang !== lang ? scan(fallbackLang) : void 0);
			}
			for (const lang of i18n.languages) scan(lang);
			return storages;
		},
		single() {
			return makeStorage(EmptyLang);
		}
	};
}
/**
* @param path - Relative path
* @returns Normalized path, with no trailing/leading slashes
* @throws Throws error if path starts with `./` or `../`
*/
function normalizePath(path) {
	const segments = splitPath(slash(path));
	if (segments[0] === "." || segments[0] === "..") throw new Error("It must not start with './' or '../'");
	return segments.join("/");
}
function pushMapList(map, k, v) {
	let list = map.get(k);
	if (!list) {
		list = [];
		map.set(k, list);
	}
	list.push(v);
}
function transformerFallback() {
	const addedFiles = /* @__PURE__ */ new Set();
	function shouldIgnore(context) {
		return context.custom?._fallback === true;
	}
	return {
		root(root) {
			if (shouldIgnore(this)) return root;
			const isolatedStorage = new FileSystem();
			if (addedFiles.size === this.storage.files.size) return root;
			for (const file of this.storage.getFiles()) {
				if (addedFiles.has(file)) continue;
				isolatedStorage.write(file, this.storage.read(file));
			}
			root.fallback = new PageTreeBuilder(isolatedStorage, {
				idPrefix: this.idPrefix ? `fallback:${this.idPrefix}` : "fallback",
				url: this.getUrl,
				noRef: this.noRef,
				transformers: this.transformers,
				generateFallback: false,
				context: {
					...this.custom,
					_fallback: true
				}
			}).root();
			addedFiles.clear();
			return root;
		},
		file(node, file) {
			if (shouldIgnore(this)) return node;
			if (file) addedFiles.add(file);
			return node;
		},
		folder(node, _dir, metaPath) {
			if (shouldIgnore(this)) return node;
			if (metaPath) addedFiles.add(metaPath);
			return node;
		}
	};
}
var group = /^\((?<name>.+)\)$/;
var link = /^(?<external>external:)?(?:\[(?<icon>[^\]]+)])?\[(?<name>[^\]]+)]\((?<url>[^)]+)\)$/;
var separator = /^---(?:\[(?<icon>[^\]]+)])?(?<name>.+)---|^---$/;
var rest = "...";
var restReversed = "z...a";
var extractPrefix = "...";
var excludePrefix = "!";
var PageTreeBuilder = class {
	constructor(input, options) {
		this.flattenPathToFullPath = /* @__PURE__ */ new Map();
		this.transformers = [];
		this.pathToNode = /* @__PURE__ */ new Map();
		this.unfinished = /* @__PURE__ */ new WeakSet();
		this.ownerMap = /* @__PURE__ */ new Map();
		this._nextId = 0;
		const { transformers, url, context, generateFallback = true, idPrefix = "", noRef = false } = options;
		if (transformers) this.transformers.push(...transformers);
		if (generateFallback) this.transformers.push(transformerFallback());
		this.ctx = {
			builder: this,
			idPrefix,
			getUrl: url,
			storage: void 0,
			noRef,
			transformers: this.transformers,
			custom: context
		};
		if (Array.isArray(input)) {
			const [locale, storages] = input;
			this.ctx.storage = this.storage = storages[locale];
			this.ctx.locale = locale;
			this.ctx.storages = storages;
		} else this.ctx.storage = this.storage = input;
		for (const file of this.storage.getFiles()) {
			const content = this.storage.read(file);
			const flattenPath = file.substring(0, file.length - extname(file).length);
			this.flattenPathToFullPath.set(flattenPath + "." + content.format, file);
		}
	}
	resolveFlattenPath(name, format) {
		return this.flattenPathToFullPath.get(name + "." + format) ?? name;
	}
	/**
	* try to register as the owner of `node`.
	*
	* when a node is referenced by multiple folders, this determines which folder they should belong to.
	*
	* @returns whether the owner owns the node.
	*/
	own(ownerPath, node, priority) {
		if (this.unfinished.has(node)) return false;
		const existing = this.ownerMap.get(node);
		if (!existing) {
			this.ownerMap.set(node, {
				owner: ownerPath,
				priority
			});
			return true;
		}
		if (existing.owner === ownerPath) {
			existing.priority = Math.max(existing.priority, priority);
			return true;
		}
		if (existing.priority >= priority) return false;
		const folder = this.pathToNode.get(existing.owner);
		if (folder && folder.type === "folder") if (folder.index === node) delete folder.index;
		else {
			const idx = folder.children.indexOf(node);
			if (idx !== -1) folder.children.splice(idx, 1);
		}
		existing.owner = ownerPath;
		existing.priority = priority;
		return true;
	}
	transferOwner(ownerPath, node) {
		const existing = this.ownerMap.get(node);
		if (existing) existing.owner = ownerPath;
	}
	generateId(localId = `_${this._nextId++}`) {
		let id = localId;
		if (this.ctx.locale) id = `${this.ctx.locale}:${id}`;
		if (this.ctx.idPrefix) id = `${this.ctx.idPrefix}:${id}`;
		return id;
	}
	buildPaths(paths, filter, reversed = false) {
		const items = [];
		const folders = [];
		const sortedPaths = paths.sort((a, b) => reversed ? b.localeCompare(a) : a.localeCompare(b));
		for (const path of sortedPaths) {
			if (filter && !filter(path)) continue;
			const fileNode = this.file(path);
			if (fileNode) {
				if (basename(path, extname(path)) === "index") items.unshift(fileNode);
				else items.push(fileNode);
				continue;
			}
			const dirNode = this.folder(path);
			if (dirNode) folders.push(dirNode);
		}
		items.push(...folders);
		return items;
	}
	resolveFolderItem(folderPath, item, outputArray, excludedPaths) {
		if (item === rest || item === restReversed) {
			outputArray.push(item);
			return;
		}
		let match = separator.exec(item);
		if (match?.groups) {
			let node = {
				$id: this.generateId(),
				type: "separator",
				icon: match.groups.icon,
				name: match.groups.name
			};
			for (const transformer of this.transformers) {
				if (!transformer.separator) continue;
				node = transformer.separator.call(this.ctx, node);
			}
			outputArray.push(node);
			return;
		}
		match = link.exec(item);
		if (match?.groups) {
			const { icon, url, name, external } = match.groups;
			let node = {
				$id: this.generateId(),
				type: "page",
				icon,
				name,
				url
			};
			if (external) node.external = true;
			for (const transformer of this.transformers) {
				if (!transformer.file) continue;
				node = transformer.file.call(this.ctx, node);
			}
			outputArray.push(node);
			return;
		}
		if (item.startsWith(excludePrefix)) {
			const path = joinPath(folderPath, item.slice(1));
			excludedPaths.add(path);
			excludedPaths.add(this.resolveFlattenPath(path, "page"));
			return;
		}
		if (item.startsWith(extractPrefix)) {
			const path = joinPath(folderPath, item.slice(3));
			const node = this.folder(path);
			if (!node) return;
			const children = node.index ? [node.index, ...node.children] : node.children;
			if (this.own(folderPath, node, 2)) {
				for (const child of children) {
					this.transferOwner(folderPath, child);
					outputArray.push(child);
				}
				excludedPaths.add(path);
			} else for (const child of children) if (this.own(folderPath, child, 2)) outputArray.push(child);
			return;
		}
		let path = joinPath(folderPath, item);
		let node = this.folder(path);
		if (!node) {
			path = this.resolveFlattenPath(path, "page");
			node = this.file(path);
		}
		if (!node || !this.own(folderPath, node, 2)) return;
		outputArray.push(node);
		excludedPaths.add(path);
	}
	folder(folderPath) {
		const cached = this.pathToNode.get(folderPath);
		if (cached) return cached;
		const files = this.storage.readDir(folderPath);
		if (!files) return;
		const isGlobalRoot = folderPath === "";
		const metaPath = this.resolveFlattenPath(joinPath(folderPath, "meta"), "meta");
		const indexPath = this.resolveFlattenPath(joinPath(folderPath, "index"), "page");
		let meta = this.storage.read(metaPath);
		if (meta && meta.format !== "meta") meta = void 0;
		const metadata = meta?.data ?? {};
		let node = {
			type: "folder",
			name: null,
			root: metadata.root,
			defaultOpen: metadata.defaultOpen,
			description: metadata.description,
			collapsible: metadata.collapsible,
			children: [],
			$id: this.generateId(folderPath),
			$ref: !this.ctx.noRef && meta ? metaPath : void 0
		};
		this.pathToNode.set(folderPath, node);
		this.unfinished.add(node);
		if (!(metadata.root ?? isGlobalRoot)) {
			const file = this.file(indexPath);
			if (file && this.own(folderPath, file, 0)) node.index = file;
		}
		if (metadata.pages) {
			const outputArray = [];
			const excludedPaths = /* @__PURE__ */ new Set();
			for (const item of metadata.pages) this.resolveFolderItem(folderPath, item, outputArray, excludedPaths);
			if (excludedPaths.has(indexPath)) delete node.index;
			else if (node.index) excludedPaths.add(indexPath);
			for (const item of outputArray) {
				if (item !== rest && item !== restReversed) {
					node.children.push(item);
					continue;
				}
				const resolvedItem = this.buildPaths(files, (file) => !excludedPaths.has(file), item === restReversed);
				for (const child of resolvedItem) if (this.own(folderPath, child, 0)) node.children.push(child);
			}
		} else for (const item of this.buildPaths(files, node.index ? (file) => file !== indexPath : void 0)) if (this.own(folderPath, item, 0)) node.children.push(item);
		node.icon = metadata.icon ?? node.index?.icon;
		node.name = metadata.title ?? node.index?.name;
		this.unfinished.delete(node);
		if (!node.name) {
			const folderName = basename(folderPath);
			node.name = pathToName(group.exec(folderName)?.[1] ?? folderName);
		}
		for (const transformer of this.transformers) {
			if (!transformer.folder) continue;
			node = transformer.folder.call(this.ctx, node, folderPath, meta ? metaPath : void 0);
		}
		this.pathToNode.set(folderPath, node);
		return node;
	}
	file(path) {
		const cached = this.pathToNode.get(path);
		if (cached) return cached;
		const page = this.storage.read(path);
		if (!page || page.format !== "page") return;
		const { title, description, icon } = page.data;
		let item = {
			$id: this.generateId(path),
			type: "page",
			name: title ?? pathToName(basename(path, extname(path))),
			description,
			icon,
			url: this.ctx.getUrl(page.slugs, this.ctx.locale),
			$ref: !this.ctx.noRef ? path : void 0
		};
		for (const transformer of this.transformers) {
			if (!transformer.file) continue;
			item = transformer.file.call(this.ctx, item, path);
		}
		this.pathToNode.set(path, item);
		return item;
	}
	root(id = "root", path = "") {
		const folder = this.folder(path);
		let root = {
			type: "root",
			$ref: folder?.$ref,
			$id: this.generateId(id),
			name: folder?.name || "Docs",
			description: folder?.description,
			children: folder ? folder.children : []
		};
		for (const transformer of this.transformers) {
			if (!transformer.root) continue;
			root = transformer.root.call(this.ctx, root);
		}
		return root;
	}
};
/**
* Get item name from file name
*
* @param name - file name
*/
function pathToName(name) {
	const result = [];
	for (const c of name) if (result.length === 0) result.push(c.toLocaleUpperCase());
	else if (c === "-") result.push(" ");
	else result.push(c);
	return result.join("");
}
function createPageIndexer({ url }) {
	const pages = /* @__PURE__ */ new Map();
	const pathToMeta = /* @__PURE__ */ new Map();
	const pathToPage = /* @__PURE__ */ new Map();
	return {
		scan(storage, lang) {
			for (const filePath of storage.getFiles()) {
				const item = storage.read(filePath);
				const prefix = lang ? `${lang}.` : ".";
				const path = prefix + filePath;
				if (item.format === "meta") {
					pathToMeta.set(path, {
						type: item.type,
						path: item.path,
						absolutePath: item.absolutePath,
						data: item.data
					});
					continue;
				}
				const page = {
					type: item.type,
					path: item.path,
					absolutePath: item.absolutePath,
					url: url(item.slugs, lang),
					slugs: item.slugs,
					data: item.data,
					locale: lang
				};
				pathToPage.set(path, page);
				pages.set(prefix + page.slugs.join("/"), page);
			}
		},
		getPage(path, lang = "") {
			return pathToPage.get(`${lang}.${path}`);
		},
		getMeta(path, lang = "") {
			return pathToMeta.get(`${lang}.${path}`);
		},
		getPageBySlugs(slugs, lang = "") {
			let page = pages.get(`${lang}.${slugs.join("/")}`);
			if (page) return page;
			page = pages.get(`${lang}.${slugs.map(decodeURI).join("/")}`);
			if (page) return page;
		},
		/** do not filter by language if `lang` is not specified */
		getPages(lang) {
			const out = [];
			for (const [key, value] of pages.entries()) if (lang === void 0 || key.startsWith(`${lang}.`)) out.push(value);
			return out;
		}
	};
}
function createGetUrl(baseUrl, i18n) {
	const baseSlugs = baseUrl.split("/");
	return (slugs, locale) => {
		const hideLocale = i18n?.hideLocale ?? "never";
		let urlLocale;
		if (hideLocale === "never") urlLocale = locale;
		else if (hideLocale === "default-locale" && locale !== i18n?.defaultLanguage) urlLocale = locale;
		const paths = [...baseSlugs, ...slugs];
		if (urlLocale) paths.unshift(urlLocale);
		return `/${paths.filter((v) => v.length > 0).join("/")}`;
	};
}
function loader(...args) {
	const loaderConfig = args.length === 2 ? resolveConfig(args[0], args[1]) : resolveConfig(args[0].source, args[0]);
	const { i18n } = loaderConfig;
	const storage = i18n ? createContentStorageBuilder(loaderConfig).i18n() : createContentStorageBuilder(loaderConfig).single();
	const indexer = createPageIndexer(loaderConfig);
	if (storage instanceof FileSystem) indexer.scan(storage);
	else for (const locale in storage) indexer.scan(storage[locale], locale);
	let pageTrees;
	function getPageTrees() {
		if (pageTrees) return pageTrees;
		const { plugins, url, pageTree: pageTreeConfig } = loaderConfig;
		const transformers = [];
		if (pageTreeConfig?.transformers) transformers.push(...pageTreeConfig.transformers);
		for (const plugin of plugins) if (plugin.transformPageTree) transformers.push(plugin.transformPageTree);
		const options = {
			url,
			...pageTreeConfig,
			transformers
		};
		if (storage instanceof FileSystem) return pageTrees = new PageTreeBuilder(storage, options).root();
		else {
			const out = {};
			for (const locale in storage) out[locale] = new PageTreeBuilder([locale, storage], options).root();
			return pageTrees = out;
		}
	}
	return {
		_i18n: i18n,
		get pageTree() {
			return getPageTrees();
		},
		set pageTree(v) {
			pageTrees = v;
		},
		getPageByHref(href, { dir = "", language = i18n?.defaultLanguage } = {}) {
			const [value, hash] = href.split("#", 2);
			let target;
			if (value.startsWith("./") || value.startsWith("../")) {
				const path = joinPath(dir, value);
				target = indexer.getPage(path, language);
			} else target = this.getPages(language).find((item) => item.url === value);
			if (target) return {
				page: target,
				hash
			};
		},
		resolveHref(href, parent) {
			if (href.startsWith("./") || href.startsWith("../")) {
				const target = this.getPageByHref(href, {
					dir: path.dirname(parent.path),
					language: parent.locale
				});
				if (target) return target.hash ? `${target.page.url}#${target.hash}` : target.page.url;
			}
			return href;
		},
		getPages(language) {
			return indexer.getPages(language);
		},
		getLanguages() {
			const list = [];
			if (!i18n) return list;
			for (const language of i18n.languages) list.push({
				language,
				pages: this.getPages(language)
			});
			return list;
		},
		getPage(slugs = [], language = i18n?.defaultLanguage) {
			return indexer.getPageBySlugs(slugs, language);
		},
		getNodeMeta(node, language = i18n?.defaultLanguage) {
			const ref = node.$ref;
			if (!ref) return;
			return indexer.getMeta(ref, language);
		},
		getNodePage(node, language = i18n?.defaultLanguage) {
			const ref = node.$ref;
			if (!ref) return;
			return indexer.getPage(ref, language);
		},
		getPageTree(locale) {
			if (i18n) {
				const trees = getPageTrees();
				if (locale && trees[locale]) return trees[locale];
				return trees[i18n.defaultLanguage];
			}
			return getPageTrees();
		},
		generateParams(slug, lang) {
			if (i18n) return this.getLanguages().flatMap((entry) => entry.pages.map((page) => ({
				[slug ?? "slug"]: page.slugs,
				[lang ?? "lang"]: entry.language
			})));
			return this.getPages().map((page) => ({ [slug ?? "slug"]: page.slugs }));
		},
		async serializePageTree(tree) {
			const { renderToString } = await import("../_libs/_.mjs").then((m) => /* @__PURE__ */ __toESM(m.default));
			return {
				$fumadocs_loader: "page-tree",
				data: visit(tree, (node) => {
					node = { ...node };
					if ("icon" in node && node.icon) node.icon = renderToString(node.icon);
					if (node.name) node.name = renderToString(node.name);
					if ("children" in node) node.children = [...node.children];
					return node;
				})
			};
		}
	};
}
function resolveConfig(input, { slugs, icon, plugins = [], baseUrl, url, ...base }) {
	let config = {
		...base,
		url: url ? (...args) => normalizeUrl(url(...args)) : createGetUrl(baseUrl, base.i18n),
		input,
		plugins: buildPlugins([
			icon && iconPlugin(icon),
			...typeof plugins === "function" ? plugins({ typedPlugin: (plugin) => plugin }) : plugins,
			slugsPlugin(slugs)
		])
	};
	for (const plugin of config.plugins) {
		const result = plugin.config?.(config);
		if (result) config = result;
	}
	return config;
}
var priorityMap = {
	pre: 1,
	default: 0,
	post: -1
};
function buildPlugins(plugins, sort = true) {
	const flatten = [];
	for (const plugin of plugins) if (Array.isArray(plugin)) flatten.push(...buildPlugins(plugin, false));
	else if (plugin) flatten.push(plugin);
	if (sort) return flatten.sort((a, b) => priorityMap[b.enforce ?? "default"] - priorityMap[a.enforce ?? "default"]);
	return flatten;
}
function llms(loader, config = {}) {
	const { TAB = "  ", renderName = (node, ctx) => {
		if (node.type === "page") {
			const page = loader.getNodePage(node, ctx.lang);
			if (page?.data.title) return page.data.title;
		} else if (node.type !== "separator") {
			const meta = loader.getNodeMeta(node, ctx.lang);
			if (meta?.data.title) return meta.data.title;
		}
		return typeof node.name === "string" ? node.name : "";
	}, renderDescription = (node, ctx) => {
		if (node.type === "page") {
			const page = loader.getNodePage(node, ctx.lang);
			if (page?.data.description) return page.data.description;
		} else {
			const meta = loader.getNodeMeta(node, ctx.lang);
			if (meta?.data.description) return meta.data.description;
		}
		return typeof node.description === "string" ? node.description : "";
	} } = config;
	function formatListItem(name, description, indent) {
		const prefix = TAB.repeat(indent);
		description = description.trim();
		if (description.length > 0) return `${prefix}- ${name}: ${description}`;
		return `${prefix}- ${name}`;
	}
	function formatNode(node, indent, ctx) {
		switch (node.type) {
			case "page": return formatListItem(formatMarkdownLink(renderName(node, ctx), node.url), renderDescription(node, ctx), indent);
			case "folder": {
				const out = [];
				out.push(formatListItem(renderName(node, ctx), renderDescription(node, ctx), indent));
				if (node.index) out.push(formatNode(node.index, indent + 1, ctx));
				for (const child of node.children) out.push(formatNode(child, indent + 1, ctx));
				return out.join("\n");
			}
			case "separator": return "\n" + formatListItem(`**${renderName(node, ctx) || "Separator"}**`, "", indent);
		}
	}
	function index(lang) {
		if (loader._i18n && lang === void 0) {
			const { languages } = loader._i18n;
			return languages.map(index).join("\n\n");
		}
		const pageTree = loader.getPageTree(lang);
		const out = [];
		const ctx = { lang };
		out.push(`# ${renderName(pageTree, ctx)}`, "");
		const description = renderDescription(pageTree, ctx);
		if (description) out.push(`> ${description}`, "");
		for (const child of pageTree.children) out.push(formatNode(child, 0, ctx));
		return out.join("\n");
	}
	return {
		/**
		* generate `llms.txt` content in Markdown format.
		*
		* use `indexNode(node)` instead for more control (e.g. add extra sections to output).
		*/
		index,
		/**
		* generate `llms.txt` content for a single page tree node.
		*/
		indexNode(node, lang) {
			return formatNode(node, 0, { lang });
		}
	};
}
function formatMarkdownLink(title, url) {
	return `[${title.replace(/([[\]])/g, "\\$1")}](${url.replace(/([()])/g, "\\$1")})`;
}
/**
* Convert icon names into Lucide Icons, requires `lucide-react` to be installed.
*/
function lucideIconsPlugin(options = {}) {
	const { defaultIcon } = options;
	return iconPlugin((icon = defaultIcon) => {
		if (icon === void 0) return;
		const Icon = icons_exports[icon];
		if (!Icon) {
			console.warn(`[lucide-icons-plugin] Unknown icon detected: ${icon}.`);
			return;
		}
		return (0, import_react.createElement)(Icon);
	});
}
function server(options = {}) {
	const { doc: { passthroughs: docPassthroughs = [] } = {} } = options;
	function fileInfo(file, base) {
		if (file.startsWith("./")) file = file.slice(2);
		return {
			path: file,
			fullPath: path$1.join(base, file)
		};
	}
	function mapDocData(entry) {
		const data = {
			body: entry.default,
			toc: entry.toc,
			structuredData: entry.structuredData,
			_exports: entry
		};
		for (const key of docPassthroughs) data[key] = entry[key];
		return data;
	}
	return {
		async doc(_name, base, glob) {
			return await Promise.all(Object.entries(glob).map(async ([k, v]) => {
				const data = typeof v === "function" ? await v() : v;
				return {
					...mapDocData(data),
					...data.frontmatter,
					...createDocMethods(fileInfo(k, base), () => data)
				};
			}));
		},
		async docLazy(_name, base, head, body) {
			return await Promise.all(Object.entries(head).map(async ([k, v]) => {
				const data = typeof v === "function" ? await v() : v;
				const content = body[k];
				return {
					...data,
					...createDocMethods(fileInfo(k, base), content),
					async load() {
						return mapDocData(await content());
					}
				};
			}));
		},
		async meta(_name, base, glob) {
			return await Promise.all(Object.entries(glob).map(async ([k, v]) => {
				const data = typeof v === "function" ? await v() : v;
				return {
					info: fileInfo(k, base),
					...data
				};
			}));
		},
		async docs(name, base, metaGlob, docGlob) {
			return {
				docs: await this.doc(name, base, docGlob),
				meta: await this.meta(name, base, metaGlob),
				toFumadocsSource(options) {
					return toFumadocsSource(this.docs, this.meta, options);
				}
			};
		},
		async docsLazy(name, base, metaGlob, docHeadGlob, docBodyGlob) {
			return {
				docs: await this.docLazy(name, base, docHeadGlob, docBodyGlob),
				meta: await this.meta(name, base, metaGlob),
				toFumadocsSource(options) {
					return toFumadocsSource(this.docs, this.meta, options);
				}
			};
		}
	};
}
function toFumadocsSource(pages, metas, options) {
	const baseDir = options?.baseDir;
	const files = [];
	for (const entry of pages) files.push({
		type: "page",
		path: baseDir ? path$1.join(baseDir, entry.info.path) : entry.info.path,
		absolutePath: entry.info.fullPath,
		data: entry
	});
	for (const entry of metas) files.push({
		type: "meta",
		path: baseDir ? path$1.join(baseDir, entry.info.path) : entry.info.path,
		absolutePath: entry.info.fullPath,
		data: entry
	});
	return { files };
}
function createDocMethods(info, load) {
	return {
		info,
		async getText(type) {
			if (type === "raw") return await (await import("node:fs/promises")).readFile(info.fullPath, "utf-8");
			const data = await load();
			if (typeof data._markdown !== "string") throw new Error("getText('processed') requires `includeProcessedMarkdown` to be enabled in your collection config.");
			return data._markdown;
		},
		async getMDAST() {
			const data = await load();
			if (!data._mdast) throw new Error("getMDAST() requires `includeMDAST` to be enabled in your collection config.");
			return JSON.parse(data._mdast);
		}
	};
}
var source = loader({
	source: (await server({ "doc": { "passthroughs": ["extractedReferences"] } }).docs("docs", "content/docs", /* @__PURE__ */ Object.assign({}), /* @__PURE__ */ Object.assign({
		"./architecture/adapter-codex.mdx": adapter_codex_exports,
		"./architecture/adapter-hermes-proxy.mdx": adapter_hermes_proxy_exports,
		"./architecture/entities.mdx": entities_exports,
		"./architecture/harness-artifacts.mdx": harness_artifacts_exports,
		"./architecture/hermes-proxy-spike.mdx": hermes_proxy_spike_exports,
		"./architecture/mission-packet-schema.mdx": mission_packet_schema_exports,
		"./architecture/overview.mdx": overview_exports,
		"./architecture/runtime-adapter-contract.mdx": runtime_adapter_contract_exports,
		"./architecture/sandbox-agentfs.mdx": sandbox_agentfs_exports,
		"./architecture/sandboxing.mdx": sandboxing_exports,
		"./architecture/skill-format.mdx": skill_format_exports,
		"./architecture/tui.mdx": tui_exports,
		"./architecture/verification-and-promotion.mdx": verification_and_promotion_exports,
		"./glossary.mdx": glossary_exports,
		"./index.mdx": docs_exports,
		"./product/mvp-scope.mdx": mvp_scope_exports,
		"./product/non-goals.mdx": non_goals_exports,
		"./product/personas.mdx": personas_exports,
		"./product/prd.mdx": prd_exports,
		"./research/adopt-reject-defer.mdx": adopt_reject_defer_exports,
		"./research/comparison-matrix.mdx": comparison_matrix_exports,
		"./research/inspiration-systems.mdx": inspiration_systems_exports,
		"./research/tui-framework.mdx": tui_framework_exports,
		"./roadmap.mdx": roadmap_exports,
		"./runbooks/anthropic-via-omp.mdx": anthropic_via_omp_exports,
		"./runbooks/codex-e2e-smoke.mdx": codex_e2e_smoke_exports,
		"./runbooks/hermes-proxy-e2e-smoke.mdx": hermes_proxy_e2e_smoke_exports,
		"./runbooks/hermes-proxy-setup.mdx": hermes_proxy_setup_exports,
		"./runbooks/using-the-tui.mdx": using_the_tui_exports,
		"./verification/audit-trail.mdx": audit_trail_exports,
		"./verification/checks.mdx": checks_exports,
		"./verification/review-gates.mdx": review_gates_exports,
		"./verification/strategy.mdx": strategy_exports,
		"./workflows/bmad-agent-map.mdx": bmad_agent_map_exports,
		"./workflows/mission-to-sandbox.mdx": mission_to_sandbox_exports,
		"./workflows/overview.mdx": overview_exports$1,
		"./workflows/plan-to-mission.mdx": plan_to_mission_exports,
		"./workflows/research-to-spec.mdx": research_to_spec_exports,
		"./workflows/spec-to-plan.mdx": spec_to_plan_exports,
		"./workflows/verify-review-promote.mdx": verify_review_promote_exports
	}))).toFumadocsSource(),
	baseUrl: docsRoute,
	plugins: [lucideIconsPlugin()]
});
function markdownPathToSlugs(segs) {
	if (segs.length === 0) return [];
	const out = [...segs];
	out[out.length - 1] = out[out.length - 1].replace(/\.md$/, "");
	if (out.length === 1 && out[0] === "index") out.pop();
	return out;
}
function slugsToMarkdownPath(slugs) {
	const segments = [...slugs];
	if (segments.length === 0) segments.push("index.md");
	else segments[segments.length - 1] += ".md";
	return {
		segments,
		url: `${docsRoute}/${segments.join("/")}`
	};
}
async function getLLMText(page) {
	const processed = await page.data.getText("processed");
	return `# ${page.data.title} (${page.url})

${processed}`;
}
//#endregion
export { markdownPathToSlugs as a, llms as i, extname as n, slugsToMarkdownPath as o, getLLMText as r, source as s, basename as t };
