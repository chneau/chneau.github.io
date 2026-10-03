import { Kbd, Modal, Stack, Text } from "@mantine/core";
import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";
import { HeaderAction } from "./HeaderAction";

export type ShortcutItem = {
	/** Individual keycaps, e.g. `["Shift", "←/→"]`. */
	keys: string[];
	description: string;
};

export type ShortcutGroup = {
	title: string;
	shortcuts: ShortcutItem[];
};

/** Shortcuts every page can advertise once it wires the shared help. */
export const APP_SWITCH_SHORTCUTS: ShortcutItem[] = [
	{ keys: ["1", "2", "3", "4", "5", "6"], description: "Open an app" },
	// The save editors, which are otherwise reachable only by scrolling or
	// searching. `T` is deliberately absent: the dashboard resolves an app
	// before it checks the theme key, so an app bound to `T` would win and the
	// theme toggle would stop working.
	{
		keys: ["Q", "W", "E", "R", "Y", "U"],
		description: "Open a save editor",
	},
	{ keys: ["T"], description: "Toggle light / dark theme" },
];

const ShortcutRow = ({ keys, description }: ShortcutItem) => (
	<div
		style={{
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 16,
		}}
	>
		<Text style={{ color: "var(--app-text-muted)", fontSize: "0.84rem" }}>
			{description}
		</Text>
		<span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
			{keys.map((key) => (
				<Kbd key={key} size="xs">
					{key}
				</Kbd>
			))}
		</span>
	</div>
);

const GroupHeading = ({ children }: { children: string }) => (
	<Text
		style={{
			color: "var(--app-text-faint)",
			fontSize: "0.72rem",
			textTransform: "uppercase",
			letterSpacing: "0.08em",
			marginBottom: 8,
		}}
	>
		{children}
	</Text>
);

type ShortcutsHelpProps = {
	opened: boolean;
	onClose: () => void;
	/** App-specific groups, shown above the shared global one. */
	groups: ShortcutGroup[];
	/** Extra site-wide keys for apps that support them (see `APP_SWITCH_SHORTCUTS`). */
	globalShortcuts?: ShortcutItem[];
	/**
	 * Whether this app actually binds the command palette.
	 *
	 * The ⌘/Ctrl+K row used to be listed unconditionally, which is a claim the
	 * dialog cannot check. Six save editors have no palette, so opening help
	 * there advertised a key that does nothing — previously invisible only
	 * because those apps had no help dialog at all.
	 */
	hasCommandPalette?: boolean;
};

/**
 * The one keyboard-shortcut dialog. Pair with `useShortcutsHelp` for the open
 * state and a `ShortcutsHelpButton` in the header.
 */
export const ShortcutsHelp = ({
	opened,
	onClose,
	groups,
	globalShortcuts,
	hasCommandPalette = false,
}: ShortcutsHelpProps) => {
	const global = [
		...(globalShortcuts ?? []),
		...(hasCommandPalette
			? [{ keys: ["⌘/Ctrl", "K"], description: "Open the command palette" }]
			: []),
		{ keys: ["?"], description: "Show this help" },
	];
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			centered
			closeButtonProps={{ "aria-label": "Close" }}
			title={
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 8,
						color: "var(--app-text)",
						fontSize: "1rem",
					}}
				>
					<Keyboard size={16} />
					Keyboard shortcuts
				</span>
			}
		>
			<Stack gap={18}>
				{groups.map((group) => (
					<div key={group.title}>
						<GroupHeading>{group.title}</GroupHeading>
						<Stack gap={10}>
							{group.shortcuts.map((shortcut) => (
								<ShortcutRow key={shortcut.description} {...shortcut} />
							))}
						</Stack>
					</div>
				))}
				<div>
					<GroupHeading>Global</GroupHeading>
					<Stack gap={10}>
						{global.map((shortcut) => (
							<ShortcutRow key={shortcut.description} {...shortcut} />
						))}
					</Stack>
				</div>
			</Stack>
		</Modal>
	);
};

type ShortcutsHelpButtonProps = {
	onClick: () => void;
	expanded?: boolean;
};

/** Header trigger for `ShortcutsHelp`, sized like every other navbar control. */
export const ShortcutsHelpButton = ({
	onClick,
	expanded,
}: ShortcutsHelpButtonProps) => (
	<HeaderAction
		iconOnly
		label="Keyboard shortcuts"
		onClick={onClick}
		ariaHaspopup="dialog"
		ariaExpanded={expanded}
		icon={<Keyboard size={16} />}
	/>
);

/**
 * The open state is shared by every caller, not per-hook.
 *
 * `useShortcutsHelp` is called both by `AppNav`, which renders the dialog, and
 * by apps that need the same state for their own handlers — the dashboard's
 * palette command, cv's Escape guard. Per-instance state made those two
 * disagree: the palette would set `opened` on an instance whose dialog nothing
 * rendered, so "Keyboard shortcuts" silently did nothing, and every caller
 * registered its own `?` listener. A module-level store makes the hook
 * idempotent, so a second caller is free and cannot drift from the first.
 */
let sharedOpened = false;
const subscribers = new Set<() => void>();

const setSharedOpened = (next: boolean | ((prev: boolean) => boolean)) => {
	sharedOpened = typeof next === "function" ? next(sharedOpened) : next;
	for (const notify of subscribers) notify();
};

/** Install the `?` binding exactly once, however many hooks ask for it. */
let keyBound = false;
const bindQuestionKey = () => {
	if (keyBound || typeof window === "undefined") return;
	keyBound = true;
	window.addEventListener("keydown", (event) => {
		if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) {
			return;
		}
		const el = document.activeElement;
		if (
			el instanceof HTMLInputElement ||
			el instanceof HTMLTextAreaElement ||
			el instanceof HTMLSelectElement
		) {
			return;
		}
		if (el instanceof HTMLElement && el.isContentEditable) {
			return;
		}
		event.preventDefault();
		setSharedOpened((prev) => !prev);
	});
};

/** Open state for `ShortcutsHelp`, bound to the `?` key (ignored while typing). */
export const useShortcutsHelp = () => {
	const [opened, setOpened] = useState(sharedOpened);

	useEffect(() => {
		// Adopt whatever the shared store already holds, so a hook mounted after
		// the dialog was opened does not render a stale `false`.
		setOpened(sharedOpened);
		const notify = () => setOpened(sharedOpened);
		subscribers.add(notify);
		bindQuestionKey();
		return () => {
			subscribers.delete(notify);
		};
	}, []);

	return {
		opened,
		open: () => setSharedOpened(true),
		close: () => setSharedOpened(false),
		toggle: () => setSharedOpened((prev) => !prev),
	};
};
