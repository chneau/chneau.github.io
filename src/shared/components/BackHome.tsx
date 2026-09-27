import { Home } from "lucide-react";
import { HeaderAction } from "./HeaderAction";

type BackHomeProps = {
	label?: string;
};

/** The one way back to the dashboard, first in every app's action group. */
export const BackHome = ({ label = "Back to dashboard" }: BackHomeProps) => (
	<HeaderAction iconOnly href="/" label={label} icon={<Home size={16} />} />
);
