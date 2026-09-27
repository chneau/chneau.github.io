import { Kbd, Modal, Stack, Text } from "@mantine/core";
import { Keyboard } from "lucide-react";
import { palette } from "../theme";

type Shortcut = {
	keys: string[];
	description: string;
};

const SHORTCUTS: Shortcut[] = [
	{ keys: ["Space"], description: "Play / pause the replay" },
	{ keys: ["←", "→"], description: "Scrub time back / forward 5 minutes" },
	{ keys: ["Shift", "←/→"], description: "Scrub in 15-minute steps" },
	{ keys: ["↑", "↓"], description: "Increase / decrease playback speed" },
	{ keys: ["M"], description: "Toggle ambient audio" },
	{ keys: ["Esc"], description: "Close the open panel or deselect a train" },
];

const POINTER_SHORTCUTS: Shortcut[] = [
	{ keys: ["Click"], description: "Inspect a train or station" },
	{ keys: ["Drag"], description: "Pan the map" },
	{ keys: ["Scroll"], description: "Zoom the map in / out" },
];

const ShortcutRow = ({ keys, description }: Shortcut) => (
	<div
		style={{
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 16,
		}}
	>
		<Text style={{ color: palette.textMuted, fontSize: "0.84rem" }}>
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

/** Dialog listing the keyboard and pointer shortcuts, linked from the header and Settings. */
export const ShortcutsModal = ({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) => (
	<Modal
		title={
			<span
				style={{
					color: palette.accent,
					fontSize: "1rem",
					display: "inline-flex",
					alignItems: "center",
					gap: 8,
				}}
			>
				<Keyboard size={16} />
				Keyboard shortcuts
			</span>
		}
		opened={open}
		onClose={onClose}
		centered
		styles={{
			body: { color: palette.text },
			header: { background: "transparent", color: palette.text },
		}}
	>
		<Stack gap={10}>
			{SHORTCUTS.map((s) => (
				<ShortcutRow key={s.description} {...s} />
			))}

			<Text
				style={{
					color: palette.textFaint,
					fontSize: "0.72rem",
					textTransform: "uppercase",
					letterSpacing: "0.08em",
					marginTop: 4,
				}}
			>
				Mouse and touch
			</Text>
			{POINTER_SHORTCUTS.map((s) => (
				<ShortcutRow key={s.description} {...s} />
			))}
		</Stack>
	</Modal>
);
