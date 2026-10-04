import { Button, CloseButton, TextInput } from "@mantine/core";
import { Search, Shuffle } from "lucide-react";
import type { RefObject } from "react";
import { APP_CATEGORIES, type AppEntry } from "../shared";

type AppToolbarProps = {
	searchRef: RefObject<HTMLInputElement | null>;
	query: string;
	onQueryChange: (value: string) => void;
	category: string;
	onCategoryChange: (category: string) => void;
	/** The current result list, so Enter can open the first match. */
	filtered: AppEntry[];
	onOpen: (href: string) => void;
	onRandom: () => void;
};

/** Search box, category chips and the "Surprise me" action. */
export const AppToolbar = ({
	searchRef,
	query,
	onQueryChange,
	category,
	onCategoryChange,
	filtered,
	onOpen,
	onRandom,
}: AppToolbarProps) => (
	<div className="app-toolbar">
		<TextInput
			ref={searchRef}
			className="app-toolbar__search"
			value={query}
			onChange={(event) => onQueryChange(event.currentTarget.value)}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onQueryChange("");
					event.currentTarget.blur();
				} else if (event.key === "Enter" && filtered[0]) {
					event.preventDefault();
					onOpen(filtered[0].href);
					window.location.href = filtered[0].href;
				}
			}}
			placeholder="Search apps, tags and categories…"
			aria-label="Search apps"
			leftSection={<Search size={16} />}
			rightSection={
				query ? (
					<CloseButton
						size="sm"
						aria-label="Clear search"
						onClick={() => onQueryChange("")}
					/>
				) : (
					<kbd className="app-kbd">/</kbd>
				)
			}
			rightSectionPointerEvents={query ? "auto" : "none"}
			size="md"
		/>
		{/* biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons is a valid role="group" composition */}
		<div className="app-chips" role="group" aria-label="Filter by category">
			<button
				type="button"
				className={`app-chip${category === "All" ? " app-chip--on" : ""}`}
				aria-pressed={category === "All"}
				onClick={() => onCategoryChange("All")}
			>
				All
			</button>
			{APP_CATEGORIES.map((name) => (
				<button
					key={name}
					type="button"
					className={`app-chip${category === name ? " app-chip--on" : ""}`}
					aria-pressed={category === name}
					onClick={() => onCategoryChange(name)}
				>
					{name}
				</button>
			))}
		</div>
		<Button
			variant="light"
			leftSection={<Shuffle size={15} />}
			onClick={onRandom}
			visibleFrom="sm"
		>
			Surprise me
		</Button>
	</div>
);
