import { i as __toESM } from "../_runtime.mjs";
import { o as require_jsx_runtime } from "./@radix-ui/react-arrow+[...].mjs";
import { u as require_react } from "./@floating-ui/react-dom+[...].mjs";
//#region node_modules/@radix-ui/react-direction/dist/index.mjs
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime(), 1);
var DirectionContext = import_react.createContext(void 0);
var DirectionProvider = (props) => {
	const { dir, children } = props;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DirectionContext.Provider, {
		value: dir,
		children
	});
};
function useDirection(localDir) {
	const globalDir = import_react.useContext(DirectionContext);
	return localDir || globalDir || "ltr";
}
//#endregion
export { useDirection as n, DirectionProvider as t };
