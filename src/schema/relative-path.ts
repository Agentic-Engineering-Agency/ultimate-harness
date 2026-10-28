import { z } from "zod";

/**
 * A path written relative to the file or project that owns it: not absolute (POSIX, drive letter or UNC) and never
 * climbing out with `..`. Used wherever a packet or registry names a file UH will later open.
 */
export const RelativePathSchema = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.startsWith("\\") && !/^[A-Za-z]:/.test(value) && !value.split(/[\\/]/).includes(".."),
  "path must be relative to its owner and stay inside it",
);
