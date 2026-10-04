import {
	Kbd,
	Modal,
	ScrollArea,
	Text,
	TextInput,
	UnstyledButton,
} from "@mantine/core";
import Fuse from "fuse.js";
import { CornerDownLeft, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ALL_APPS } from "../apps";
import { HeaderAction } from "./HeaderAction";

export type Command = {
	/** Stable id, also used for the DOM id. */
	id: string;
	label: string;
	/** Short right-aligned context, e.g. a tag or category. */
	hint?: string;
	/** Extra text searched in addition to the label. */
	keywords?: string;
	/** Single-key launch shortcut, rendered as a keycap. */
	hotkey?: string;
	icon?: ReactNode;
	run: () => void;
};

const NAV_COMMANDS: Command[] = ALL_APPS.map((app) => {
	const Icon = app.icon;
	return {
		id: `nav-${app.href}`,
		label: `Go to ${app.title}`,
		hint: app.tag,
		keywords: app.description,
		hotkey: app.hotkey,
		icon: <Icon size={16} />,
		run: () => {
			window.location.href = app.href;
		},
	};
});

const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<Command>>[1] = {
	keys: ["label", "hint", "keywords"],
	threshold: 0.38,
	ignoreLocation: true,
};

/** Open state for `CommandPalette`, bound to Cmd/Ctrl-K. */
export const useCommandPalette = () => {
	const [opened, setOpened] = useState(false);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "k") return;
			if (!event.metaKey && !event.ctrlKey) return;
			if (event.altKey || event.shiftKey) return;
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

type CommandPaletteProps = {
	opened: boolean;
	onClose: () => void;
	/** App-specific actions; navigation to every app is always included. */
	commands?: Command[];
};

/** Shared empty default, so `allCommands` keeps a stable identity. */
const EMPTY_COMMANDS: Command[] = [];

/** A Cmd/Ctrl-K palette that jumps between apps and runs app actions. */
export const CommandPalette = ({
	opened,
	onClose,
	// Hoisted for the same reason as `AppNav`'s `shortcuts`: an inline `[]` default
	// is a new array every render, which defeated the `Fuse` index below — it is
	// keyed on `[allCommands]`, so a fresh array rebuilt the index on every render
	// of the parent. Never mutated, so one shared constant is safe.
	commands = EMPTY_COMMANDS,
}: CommandPaletteProps) => {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	/** True while the user steers with the keyboard; stops hover stealing focus. */
	const keyboardNav = useRef(false);

	const allCommands = useMemo(() => [...commands, ...NAV_COMMANDS], [commands]);
	const fuse = useMemo(
		() => new Fuse(allCommands, FUSE_OPTIONS),
		[allCommands],
	);

	const items = useMemo(() => {
		const trimmed = query.trim();
		return trimmed
			? fuse.search(trimmed).map((result) => result.item)
			: allCommands;
	}, [allCommands, fuse, query]);

	useEffect(() => {
		setActive(0);
	}, []);

	useEffect(() => {
		if (opened) {
			setQuery("");
			setActive(0);
			keyboardNav.current = false;
		}
	}, [opened]);

	// Keep the highlighted row valid as the result set shrinks/grows.
	useEffect(() => {
		setActive((index) =>
			items.length === 0 ? 0 : Math.min(index, items.length - 1),
		);
	}, [items]);

	const runAt = (index: number) => {
		const command = items[index];
		if (!command) return;
		command.run();
		onClose();
	};

	const activeId = items[active] ? `command-${items[active].id}` : undefined;

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			centered
			size="lg"
			padding="sm"
			withCloseButton={false}
			title={
				<span
					style={{
						fontSize: "0.9rem",
						color: "var(--app-text-muted)",
					}}
				>
					Command palette
				</span>
			}
			transitionProps={{ onEntered: () => inputRef.current?.focus() }}
		>
			<TextInput
				ref={inputRef}
				value={query}
				onChange={(event) => setQuery(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (items.length === 0) return;
					if (event.key === "ArrowDown") {
						event.preventDefault();
						keyboardNav.current = true;
						setActive((index) => (index + 1) % items.length);
					} else if (event.key === "ArrowUp") {
						event.preventDefault();
						keyboardNav.current = true;
						setActive((index) => (index - 1 + items.length) % items.length);
					} else if (event.key === "Enter") {
						event.preventDefault();
						runAt(active);
					}
				}}
				placeholder="Search apps and actions…"
				aria-label="Search apps and actions"
				role="combobox"
				aria-expanded={items.length > 0}
				aria-controls="command-palette-list"
				aria-activedescendant={activeId}
				leftSection={<Search size={16} />}
				rightSection={
					<Kbd size="xs" style={{ pointerEvents: "none" }}>
						Esc
					</Kbd>
				}
				size="md"
				styles={{ input: { background: "var(--app-surface-2)" } }}
			/>
			<ScrollArea.Autosize mah={360} mt="sm" type="auto">
				<div id="command-palette-list" role="listbox" aria-label="Results">
					{items.map((command, index) => (
						<UnstyledButton
							key={command.id}
							id={`command-${command.id}`}
							role="option"
							aria-selected={index === active}
							onMouseMove={() => {
								if (keyboardNav.current) return;
								setActive(index);
							}}
							onClick={() => runAt(index)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								width: "100%",
								padding: "9px 10px",
								borderRadius: "var(--app-radius-sm)",
								color: "var(--app-text)",
								background:
									index === active ? "var(--app-surface-3)" : "transparent",
							}}
						>
							<span
								style={{
									display: "inline-flex",
									color: "var(--app-text-muted)",
									flexShrink: 0,
								}}
							>
								{command.icon}
							</span>
							<span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
								{command.label}
							</span>
							{command.hint ? (
								<Text
									style={{
										color: "var(--app-text-faint)",
										fontSize: "0.76rem",
										flexShrink: 0,
									}}
								>
									{command.hint}
								</Text>
							) : null}
							{command.hotkey ? (
								<Kbd size="xs" style={{ flexShrink: 0 }}>
									{command.hotkey}
								</Kbd>
							) : null}
							{index === active ? (
								<CornerDownLeft
									size={14}
									aria-hidden
									style={{ color: "var(--app-text-faint)", flexShrink: 0 }}
								/>
							) : null}
						</UnstyledButton>
					))}
				</div>
				{items.length === 0 ? (
					<Text
						style={{
							color: "var(--app-text-faint)",
							fontSize: "0.84rem",
							padding: "14px 10px",
						}}
					>
						No matches.
					</Text>
				) : null}
			</ScrollArea.Autosize>
		</Modal>
	);
};

/** Header trigger that opens the command palette. */
export const CommandPaletteButton = ({ onClick }: { onClick: () => void }) => (
	<HeaderAction
		iconOnly
		label="Search apps and actions"
		menuLabel="Search apps and actions"
		onClick={onClick}
		icon={<Search size={16} />}
	/>
);
