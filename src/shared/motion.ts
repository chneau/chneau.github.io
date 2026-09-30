/**
 * The media query every reduced-motion decision hangs off. Kept as a constant so
 * a test can assert we ask for exactly this feature and no other.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * True when the user has asked the OS to minimise motion.
 *
 * Deliberately a one-shot read, evaluated fresh on every call. It is a plain
 * function rather than a module-level snapshot or a subscription because both
 * of its call sites want the answer *at a point in time*, and a cached value
 * would be wrong for them:
 *
 * - `cv/App.tsx` asks inside a click handler, to pick `scrollTo` behaviour, so
 *   it wants the preference as it is when the user clicks.
 * - `scotland-rail/ReplayCanvas.tsx` asks while rendering a canvas that already
 *   re-renders from a 60 fps store subscription, so re-reading each render keeps
 *   it current for free.
 *
 * A component that has to *react* to the preference changing (mount, unmount,
 * replay) should subscribe instead - Mantine's `useReducedMotion` does, and it
 * is also what its transitions read.
 *
 * This only covers decisions JavaScript makes. Declarative motion (CSS
 * transitions, animations, smooth scrolling driven from a stylesheet) is
 * handled by the global `prefers-reduced-motion` reset in `base.css`, so never
 * reintroduce an inline `transition`/`animation` style: inline styles outrank
 * every author rule, including that reset.
 */
export const prefersReducedMotion = (): boolean =>
	typeof window !== "undefined" &&
	typeof window.matchMedia === "function" &&
	window.matchMedia(REDUCED_MOTION_QUERY).matches;
