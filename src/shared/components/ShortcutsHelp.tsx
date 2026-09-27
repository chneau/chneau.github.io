import { Kbd, Modal, Stack, Text } from "@mantine/core";
import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";
import { HeaderAction } from "./HeaderAction";

type ShortcutItem = {
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
}: ShortcutsHelpProps) => {
	const global = [
		...(globalShortcuts ?? []),
		{ keys: ["⌘/Ctrl", "K"], description: "Open the command palette" },
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

/** Open state for `ShortcutsHelp`, bound to the `?` key (ignored while typing). */
export const useShortcutsHelp = () => {
	const [opened, setOpened] = useState(false);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
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
			setOpened((prev) => !prev);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return {
		opened,
		open: () => setOpened(true),
		close: () => setOpened(false),
		toggle: () => setOpened((prev) => !prev),
	};
};
