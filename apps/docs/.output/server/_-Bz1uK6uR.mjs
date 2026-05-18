import { D as notFound } from "./_libs/@tanstack/react-router+[...].mjs";
import { i as TSS_SERVER_FUNCTION, l as createServerFn } from "./_ssr/esm-DaX-Y_xv.mjs";
import { a as staticFunctionMiddleware } from "./_ssr/staticFunctionMiddleware-DKfZ4dwE.mjs";
import { o as slugsToMarkdownPath, s as source } from "./_ssr/source-Ddd-zLGf.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/_-Bz1uK6uR.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var loader_createServerFn_handler = createServerRpc({
	id: "3dffc64eabe29fc8f5f4021f5e1cdf4bfea9319ffba3a59848ead9dcd2fa0308",
	name: "loader",
	filename: "src/routes/docs/$.tsx"
}, (opts) => loader.__executeServer(opts));
var loader = createServerFn({ method: "GET" }).inputValidator((slugs) => slugs).middleware([staticFunctionMiddleware]).handler(loader_createServerFn_handler, async ({ data: slugs }) => {
	const page = source.getPage(slugs);
	if (!page) throw notFound();
	return {
		path: page.path,
		markdownUrl: slugsToMarkdownPath(page.slugs).url,
		pageTree: await source.serializePageTree(source.getPageTree())
	};
});
//#endregion
export { loader_createServerFn_handler };
