import { ActionIcon, TextInput } from "@mantine/core";
import { Search, X } from "lucide-react";

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
