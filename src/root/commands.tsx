import { Keyboard, Moon, Search, Shield, Shuffle, Sun, X } from "lucide-react";
import type { RefObject } from "react";
import type { Command as PaletteCommand } from "../shared";
import type { RecentApp } from "../shared/recent";
import { GithubIcon } from "./GithubIcon";

type CreateCommandsOptions = {
	/** The toolbar search input, focused by the "Search apps" command. */
	searchRef: RefObject<HTMLInputElement | null>;
	openRandom: () => void;
	theme: { dark: boolean; toggle: () => void };
	shortcuts: { open: () => void };
	analyticsOn: boolean;
	toggleAnalytics: () => void;
	recents: RecentApp[];
	clearRecents: () => void;
};

/** The dashboard's own actions, appended to the shared navigation commands. */
export const createCommands = ({
	searchRef,
	openRandom,
	theme,
	shortcuts,
	analyticsOn,
	toggleAnalytics,
	recents,
	clearRecents,
}: CreateCommandsOptions): PaletteCommand[] => {
	const commands: PaletteCommand[] = [
		{
			id: "focus-search",
			label: "Search apps",
			hint: "/",
			keywords: "find filter jump",
			icon: <Search size={16} />,
			run: () => searchRef.current?.focus(),
		},
		{
			id: "surprise",
			label: "Surprise me — open a random app",
			keywords: "random shuffle discover",
			icon: <Shuffle size={16} />,
			run: openRandom,
		},
		{
			id: "toggle-theme",
			label: theme.dark ? "Switch to light theme" : "Switch to dark theme",
			hint: "T",
			keywords: "theme dark light mode appearance",
			icon: theme.dark ? <Sun size={16} /> : <Moon size={16} />,
			run: () => theme.toggle(),
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			hint: "?",
			keywords: "shortcuts keyboard keys help",
			icon: <Keyboard size={16} />,
			run: () => shortcuts.open(),
		},
		{
			id: "github",
			label: "Open GitHub profile",
			keywords: "source code repository",
			icon: <GithubIcon size={16} />,
			run: () =>
				window.open("https://github.com/chneau", "_blank", "noreferrer"),
		},
		{
			id: "analytics",
			label: analyticsOn ? "Turn analytics off" : "Turn analytics on",
			keywords: "privacy consent tracking telemetry cookies",
			icon: <Shield size={16} />,
			run: toggleAnalytics,
		},
	];
	if (recents.length > 0) {
		commands.push({
			id: "clear-recents",
			label: "Clear recently opened",
			keywords: "history reset recents",
			icon: <X size={16} />,
			run: clearRecents,
		});
	}
	return commands;
};
