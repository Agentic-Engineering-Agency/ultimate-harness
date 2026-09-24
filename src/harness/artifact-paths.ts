import path from "node:path";

/** Return a relative persisted artifact path with platform-independent separators. */
export function relativeArtifactPath(from: string, to: string): string {
  const pathApi = path.win32.isAbsolute(from) || path.win32.isAbsolute(to) ? path.win32 : path;
  // A target on another volume has no relative form; it is kept absolute, still with forward slashes.
  return pathApi.relative(from, to).split(pathApi.sep).join("/");
}
