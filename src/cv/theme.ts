/**
 * The CV's pre-single-key theme store.
 *
 * The site now persists theme mode in one shared key (see
 * `shared/hooks/useThemeMode`); this constant is kept because `App.tsx` passes
 * it to `useThemeMode`, which migrates the value across and then deletes the
 * old entry. Older CV builds wrote a bare `"dark"`/`"light"` word, which the
 * shared decoder still understands.
 */
export const CV_THEME_KEY = "chneau_cv_theme";
