import { Home } from "lucide-react";
import { HeaderAction } from "./HeaderAction";

type BackHomeProps = {
	label?: string;
};

export const BackHome = ({ label = "Back to dashboard" }: BackHomeProps) => (
	<HeaderAction
		iconOnly
		href="/"
		label={label}
		menuLabel={label}
		icon={<Home size={16} />}
	/>
);
