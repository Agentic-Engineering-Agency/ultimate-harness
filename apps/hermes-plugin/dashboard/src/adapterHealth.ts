/**
 * Pure helpers for rendering the adapter health badge in the overview tab.
 *
 * Pulled out of ``OverviewTab.tsx`` so we can unit-test it without booting
 * the host SDK and to make the three states explicit. The old code used
 * ``a.check?.ok !== false`` which collapsed ``null``/``undefined`` (check
 * never ran) into the green "OK" path — operators saw a false-positive
 * health signal when ``uh adapter check`` was missing or timed out
 * (PR #89 finding #4).
 */
/** Subset of ``AdapterEntry['check']`` consumed by the badge mapping. */
export type AdapterCheck = { ok: boolean; version?: string; error?: string } | null | undefined;

/** Subset of host shadcn ``Badge`` variants this module emits. */
export type BadgeVariant = "default" | "destructive" | "outline";

export interface HealthBadge {
  /** Short status word shown inside the badge. */
  label: string;
  /** shadcn variant: ``default`` = green, ``destructive`` = red, ``outline`` = gray. */
  variant: BadgeVariant;
  /** Long-form tooltip for screenreaders / hover. */
  title: string;
}

/**
 * Map an adapter's ``check`` field to the badge it should render.
 *
 *   * ``check.ok === true``                 → green "OK"
 *   * ``check.ok === false``                → red "fail"
 *   * ``check === null`` / ``undefined``    → gray "?" (unknown)
 *
 * The unknown state is what we render when ``uh adapter check`` wasn't run
 * (binary missing, timeout, plugin booted before the first poll). Painting
 * it green made operators trust adapters that were never verified — the
 * whole point of the column.
 */
export function adapterHealthBadge(check: AdapterCheck): HealthBadge {
  if (check === null || check === undefined) {
    return { label: "?", variant: "outline", title: "check not run" };
  }
  if (check.ok === true) {
    return { label: "OK", variant: "default", title: "check passed" };
  }
  return { label: "fail", variant: "destructive", title: check.error ?? "check failed" };
}

