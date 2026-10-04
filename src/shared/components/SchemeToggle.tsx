import { Moon, Sun } from "lucide-react";
import { HeaderAction } from "./HeaderAction";

type SchemeToggleProps = {
	dark: boolean;
	onToggle: () => void;
};

/** The standard light/dark switch, sized like every other navbar control. */
export const SchemeToggle = ({ dark, onToggle }: SchemeToggleProps) => {
	// Stated once so the menu row and the button's accessible name cannot drift.
	const label = dark ? "Light mode" : "Dark mode";
	return (
		<HeaderAction
			iconOnly
			ariaPressed={dark}
			label={label}
			menuLabel={label}
			onClick={onToggle}
			icon={dark ? <Sun size={16} /> : <Moon size={16} />}
		/>
	);
};
