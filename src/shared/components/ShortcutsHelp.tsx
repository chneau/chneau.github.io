import { Kbd, Modal, Stack, Text } from "@mantine/core";
import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";
import type { ShortcutGroup, ShortcutItem } from "../shortcutData";
import { HeaderAction } from "./HeaderAction";

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
	groups: readonly ShortcutGroup[];
	globalShortcuts?: ShortcutItem[];
	hasCommandPalette?: boolean;
};

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

export const ShortcutsHelpButton = ({
	onClick,
	expanded,
}: ShortcutsHelpButtonProps) => (
	<HeaderAction
		iconOnly
		label="Keyboard shortcuts"
		menuLabel="Keyboard shortcuts"
		onClick={onClick}
		ariaHaspopup="dialog"
		ariaExpanded={expanded}
		icon={<Keyboard size={16} />}
	/>
);

let sharedOpened = false;
const subscribers = new Set<() => void>();

const setSharedOpened = (next: boolean | ((prev: boolean) => boolean)) => {
	sharedOpened = typeof next === "function" ? next(sharedOpened) : next;
	for (const notify of subscribers) notify();
};

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

export const useShortcutsHelp = () => {
	const [opened, setOpened] = useState(sharedOpened);

	useEffect(() => {
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
