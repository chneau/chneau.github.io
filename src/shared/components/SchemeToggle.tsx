import { ActionIcon, type ActionIconProps, Tooltip } from "@mantine/core";
import { Moon, Sun } from "lucide-react";

type SchemeToggleProps = {
	dark: boolean;
	onToggle: () => void;
	size?: ActionIconProps["size"];
};

/** Standard light/dark switch for the site headers. */
export const SchemeToggle = ({
	dark,
	onToggle,
	size = "lg",
}: SchemeToggleProps) => (
	<Tooltip label={dark ? "Light mode" : "Dark mode"}>
		<ActionIcon
			variant="default"
			size={size}
			aria-label="Toggle colour scheme"
			onClick={onToggle}
		>
			{dark ? <Sun size={16} /> : <Moon size={16} />}
		</ActionIcon>
	</Tooltip>
);
