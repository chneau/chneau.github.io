import { Moon, Sun } from "lucide-react";
import { HeaderAction } from "./HeaderAction";

type SchemeToggleProps = {
	dark: boolean;
	onToggle: () => void;
};

export const SchemeToggle = ({ dark, onToggle }: SchemeToggleProps) => {
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
