import { ActionIcon, TextInput } from "@mantine/core";
import { Search, X } from "lucide-react";

/**
 * The search box every list panel opens with.
 *
 * Four panels wrote this markup out, and they drifted: one cleared the search
 * without returning to the first page, one cleared it and did. The clear button
 * therefore takes `onClear` rather than doing the clearing itself — the panel
 * owns its page, and a search change that leaves the reader on page 7 of 3 is
 * the bug this shape exists to prevent.
 */
export const PanelSearchField = ({
	label,
	placeholder,
	value,
	onChange,
	onClear,
}: {
	label: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	/** Called instead of `onChange("")` when the clear button is used. */
	onClear: () => void;
}) => (
	<TextInput
		w="100%"
		style={{ flex: 1, minWidth: "12rem" }}
		label={label}
		placeholder={placeholder}
		leftSection={<Search size={16} />}
		rightSection={
			value ? (
				<ActionIcon
					size="xs"
					variant="subtle"
					color="gray"
					onClick={onClear}
					title="Clear search"
					aria-label="Clear search"
				>
					<X size={14} />
				</ActionIcon>
			) : null
		}
		value={value}
		onChange={(event) => onChange(event.currentTarget.value)}
	/>
);
