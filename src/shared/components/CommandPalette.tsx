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
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ALL_APPS } from "../apps";
import { HeaderAction } from "./HeaderAction";

export type Command = {
	id: string;
	label: string;
	hint?: string;
	keywords?: string;
	hotkey?: string;
	shortcutKey?: string;
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
		shortcutKey: app.shortcutKey,
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

const LIST_ID = "command-palette-list";

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
	commands?: Command[];
};

const EMPTY_COMMANDS: Command[] = [];

export const CommandPalette = ({
	opened,
	onClose,
	commands = EMPTY_COMMANDS,
}: CommandPaletteProps) => {
	const inputRef = useRef<HTMLInputElement>(null);

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
			<CommandPaletteBody
				commands={commands}
				onClose={onClose}
				inputRef={inputRef}
			/>
		</Modal>
	);
};

const CommandPaletteBody = ({
	commands,
	onClose,
	inputRef,
}: {
	commands: Command[];
	onClose: () => void;
	inputRef: RefObject<HTMLInputElement | null>;
}) => {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const keyboardNav = useRef(false);
	const composing = useRef(false);

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

	const activeIndex =
		items.length === 0 ? 0 : Math.min(active, items.length - 1);

	const runAt = (index: number) => {
		const command = items[index];
		if (!command) return;
		command.run();
		onClose();
	};

	const activeId = items[activeIndex]
		? `command-${items[activeIndex].id}`
		: undefined;

	return (
		<>
			<TextInput
				ref={inputRef}
				value={query}
				onCompositionStart={() => {
					composing.current = true;
				}}
				onCompositionEnd={() => {
					composing.current = false;
				}}
				onChange={(event) => setQuery(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (composing.current) return;
					if (items.length === 0) return;
					if (event.key === "ArrowDown") {
						event.preventDefault();
						keyboardNav.current = true;
						setActive((activeIndex + 1) % items.length);
					} else if (event.key === "ArrowUp") {
						event.preventDefault();
						keyboardNav.current = true;
						setActive((activeIndex - 1 + items.length) % items.length);
					} else if (event.key === "Enter") {
						event.preventDefault();
						runAt(activeIndex);
					}
				}}
				placeholder="Search apps and actions…"
				aria-label="Search apps and actions"
				role="combobox"
				aria-expanded={items.length > 0}
				aria-controls={items.length > 0 ? LIST_ID : undefined}
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
				{items.length > 0 ? (
					<div id={LIST_ID} role="listbox" aria-label="Results">
						{items.map((command, index) => (
							<UnstyledButton
								key={command.id}
								id={`command-${command.id}`}
								role="option"
								aria-selected={index === activeIndex}
								tabIndex={-1}
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
										index === activeIndex
											? "var(--app-surface-3)"
											: "transparent",
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
									<Kbd
										size="xs"
										style={{ flexShrink: 0 }}
										aria-label={command.shortcutKey}
										title={command.shortcutKey}
									>
										{command.hotkey}
									</Kbd>
								) : null}
								{index === activeIndex ? (
									<CornerDownLeft
										size={14}
										aria-hidden
										style={{ color: "var(--app-text-faint)", flexShrink: 0 }}
									/>
								) : null}
							</UnstyledButton>
						))}
					</div>
				) : (
					<Text
						role="status"
						style={{
							color: "var(--app-text-faint)",
							fontSize: "0.84rem",
							padding: "14px 10px",
						}}
					>
						No matches.
					</Text>
				)}
			</ScrollArea.Autosize>
		</>
	);
};

export const CommandPaletteButton = ({ onClick }: { onClick: () => void }) => (
	<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
		<HeaderAction
			iconOnly
			label="Search apps and actions"
			menuLabel="Search apps and actions"
			onClick={onClick}
			icon={<Search size={16} />}
		/>
		<Kbd size="xs" style={{ pointerEvents: "none" }}>
			⌘K / Ctrl+K
		</Kbd>
	</span>
);
