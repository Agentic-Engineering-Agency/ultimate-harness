/**
 * Plugin SDK type shims for the Hermes Dashboard.
 *
 * The dashboard exposes React and a small UI kit on `window.__HERMES_PLUGIN_SDK__`
 * so plugins ship as tiny IIFE bundles without bundling React. We declare a minimal
 * surface here instead of pulling in `@types/react` — the goal is editor IntelliSense,
 * not a fully accurate React typing.
 *
 * Source of truth: https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard
 */

declare global {
  type ReactNode = any;
  type ReactElement = any;
  type RefObject<T> = { current: T };
  type SetStateAction<T> = T | ((prev: T) => T);
  type Dispatch<A> = (value: A) => void;
  type EffectCallback = () => void | (() => void);
  type DependencyList = ReadonlyArray<unknown>;

  interface ReactStatic {
    createElement(type: any, props?: any, ...children: any[]): ReactElement;
    Fragment: any;
    useState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
    useEffect(fn: EffectCallback, deps?: DependencyList): void;
    useCallback<T extends (...args: any[]) => any>(fn: T, deps: DependencyList): T;
    useMemo<T>(fn: () => T, deps: DependencyList): T;
    useRef<T>(initial: T): RefObject<T>;
    useContext<T>(ctx: any): T;
    createContext<T>(initial: T): any;
  }

  // Bundle banner injects: `var React = window.__HERMES_PLUGIN_SDK__.React;`
  // so `React.createElement` is available globally inside the IIFE.
  const React: ReactStatic;

  namespace JSX {
    interface Element extends ReactElement {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    interface ElementChildrenAttribute {
      children: {};
    }
  }

  interface HermesSdkApi {
    getStatus(): Promise<any>;
    getSessions(limit?: number): Promise<any>;
    getConfig?(): Promise<any>;
  }

  interface HermesSdkComponents {
    Card: any;
    CardHeader: any;
    CardTitle: any;
    CardContent: any;
    Badge: any;
    Button: any;
    Input: any;
    Label: any;
    Select: any;
    SelectOption: any;
    Separator: any;
    Tabs: any;
    TabsList: any;
    TabsTrigger: any;
    PluginSlot: any;
  }

  interface HermesSdkUtils {
    cn(...args: Array<string | undefined | null | false>): string;
    timeAgo(unixSeconds: number): string;
    isoTimeAgo(iso: string): string;
  }

  interface HermesSdk {
    React: ReactStatic;
    hooks: ReactStatic;
    components: HermesSdkComponents;
    api: HermesSdkApi;
    fetchJSON: <T = any>(url: string, init?: RequestInit) => Promise<T>;
    utils: HermesSdkUtils;
  }

  interface HermesPluginRegistry {
    register(name: string, Component: any): void;
    registerSlot(name: string, slot: string, Component: any): void;
  }

  interface Window {
    __HERMES_PLUGIN_SDK__: HermesSdk;
    __HERMES_PLUGINS__: HermesPluginRegistry;
  }
}

export {};
