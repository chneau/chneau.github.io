import { Button } from "@mantine/core";
import { Search, X } from "lucide-react";
import { CATEGORIES } from "../data/types";
import { railActions } from "../store";
import { palette } from "../theme";
import { formatTime } from "../utils";

/**
 * The floating banner shown when the filters on the map have hidden every
 * service. It exists because an empty map is otherwise indistinguishable from a
 * broken one, so it names the reason and offers the two ways out: clear the
 * search, or show every category.
 */
export const NoMatchBanner = ({
	searchQuery,
	selectedCategory,
	timeOffset,
}: {
	searchQuery: string;
	selectedCategory: keyof typeof CATEGORIES | "all";
	timeOffset: number;
}) => {
	const hasSearch = searchQuery.trim().length > 0;
	const hasCategoryFilter = selectedCategory !== "all";
	const categoryLabel =
		selectedCategory !== "all" ? CATEGORIES[selectedCategory].label : "";

	return (
		<div
			className="sr-glass sr-rise"
			style={{
				position: "absolute",
				top: 16,
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 20,
				border: `1px solid ${palette.danger}`,
				borderRadius: 10,
				padding: "8px 14px",
				display: "flex",
				alignItems: "center",
				flexWrap: "wrap",
				gap: 12,
				color: palette.text,
				maxWidth: "calc(100vw - 32px)",
			}}
		>
			<Search size={16} style={{ color: palette.danger }} />
			<span style={{ fontSize: "0.85rem" }}>
				{hasSearch ? (
					<>
						No service matches <b>"{searchQuery}"</b>
					</>
				) : (
					<>
						No <b>{categoryLabel}</b> service is running
					</>
				)}{" "}
				at <span className="sr-num">{formatTime(timeOffset)}</span>
			</span>
			{hasSearch && (
				<ClearButton
					label="Clear search"
					icon={<X size={14} />}
					onClick={() => railActions.setSearchQuery("")}
				/>
			)}
			{hasCategoryFilter && (
				<ClearButton
					label="Show all categories"
					onClick={() => railActions.setSelectedCategory("all")}
				/>
			)}
		</div>
	);
};

const ClearButton = ({
	label,
	icon,
	onClick,
}: {
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
}) => (
	<Button
		size="xs"
		variant="subtle"
		color="red"
		leftSection={icon}
		onClick={onClick}
		style={{
			color: palette.danger,
			border: `1px solid ${palette.danger}`,
		}}
	>
		{label}
	</Button>
);
