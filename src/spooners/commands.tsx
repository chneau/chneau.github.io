import { FilterX, Keyboard, Moon, Sun } from "lucide-react";
import type { Command } from "../shared";

export const createSpoonerCommands = ({
	dark,
	toggleTheme,
	openShortcuts,
	resetFilters,
}: {
	dark: boolean;
	toggleTheme: () => void;
	openShortcuts: () => void;
	resetFilters: () => void;
}): Command[] => [
	{
		id: "toggle-theme",
		label: "Toggle light / dark theme",
		keywords: "theme dark light mode appearance",
		icon: dark ? <Sun size={16} /> : <Moon size={16} />,
		run: toggleTheme,
	},
	{
		id: "keyboard-shortcuts",
		label: "Keyboard shortcuts",
		hint: "?",
		keywords: "shortcuts keyboard keys help",
		icon: <Keyboard size={16} />,
		run: openShortcuts,
	},
	{
		id: "clear-filters",
		label: "Clear all filters",
		keywords: "reset clear filters area",
		icon: <FilterX size={16} />,
		run: resetFilters,
	},
];
