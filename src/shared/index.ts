export { APP_CATEGORIES, APPS, type AppEntry } from "./apps";
export { AppCard } from "./components/AppCard";
export { AppNav } from "./components/AppNav";
export { AppSwitcher } from "./components/AppSwitcher";
export { Brand } from "./components/Brand";
export type { Command } from "./components/CommandPalette";
export {
	CommandPalette,
	CommandPaletteButton,
	useCommandPalette,
} from "./components/CommandPalette";
export { EmptyState } from "./components/EmptyState";
export { Footer } from "./components/Footer";
export { Grain } from "./components/Grain";
export { HeaderAction } from "./components/HeaderAction";
export { HeaderOverflow } from "./components/HeaderOverflow";
export { SchemeToggle } from "./components/SchemeToggle";
export { Section } from "./components/Section";
export {
	ShortcutsHelp,
	ShortcutsHelpButton,
	useShortcutsHelp,
} from "./components/ShortcutsHelp";
export { Skeleton } from "./components/Skeleton";
export { SkipLink } from "./components/SkipLink";
export { Stat } from "./components/Stat";
export { StatusDot } from "./components/StatusDot";
export { ThemedProvider } from "./components/ThemedProvider";
export {
	applyColorMode,
	type ColorMode,
	initTheme,
	type ResolvedColorMode,
	ROOT_THEME_KEY,
	resolveColorMode,
	THEME_MODE_KEY,
	useThemeMode,
} from "./hooks/useThemeMode";
export { prefersReducedMotion } from "./motion";
export { usePinnedApps, useRecents } from "./recent";
// The save-editing framework, re-exported from one barrel so a game's codec is
// a single import. Deliberately not exhaustive: the workbench components and
// the byte/JSON helpers are imported from their own modules by the code that
// needs them, and a re-export nothing imports is dead weight `check:export`
// rightly refuses. Add a name here when an app reaches for the barrel.
export {
	ByteReader,
	type Bytes,
	ByteWriter,
	bytesEqual,
	firstDifference,
	fromHex,
	indexOfBytes,
	toHex,
	utf16leBytes,
	zlibDeflate,
	zlibInflate,
} from "./save/bytes";
export {
	type SaveSample,
	SaveWorkbench,
} from "./save/components/SaveWorkbench";
export {
	aesCbcDecrypt,
	aesCbcEncrypt,
	base64Decode,
	base64Encode,
	pbkdf2Sha1,
	xorBytes,
} from "./save/crypto";
export { applyEdits, editId, effectiveEdits, withEdits } from "./save/edits";
export { formatBytes } from "./save/file";
export {
	arrayAt,
	getAtPath,
	isJsonObject,
	type JsonValue,
	numberAt,
	objectAt,
	type PathSegment,
	requireArrayAt,
	requireNumberAt,
	requireObjectAt,
	requireStringAt,
	type SavePath,
	setAtPath,
	stringAt,
} from "./save/json";
export { yieldToBrowser } from "./save/macrotask";
export { verifyRoundTrip } from "./save/roundtrip";
export type {
	FormatNote,
	QuickAction,
	SaveCodec,
	SaveEdit,
	SummaryRow,
} from "./save/types";
export { registerServiceWorker } from "./service-worker";
export {
	APP_SWITCH_SHORTCUTS,
	type ShortcutGroup,
} from "./shortcutData";
export { createAppTheme } from "./theme";
