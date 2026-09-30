import { Moon, Sun } from "lucide-react";
import { HeaderAction } from "./HeaderAction";

type SchemeToggleProps = {
	dark: boolean;
	onToggle: () => void;
};

/** The standard light/dark switch, sized like every other navbar control. */
export const SchemeToggle = ({ dark, onToggle }: SchemeToggleProps) => (
	<HeaderAction
		iconOnly
		ariaPressed={dark}
		label={dark ? "Light mode" : "Dark mode"}
		onClick={onToggle}
		icon={dark ? <Sun size={16} /> : <Moon size={16} />}
	/>
);
