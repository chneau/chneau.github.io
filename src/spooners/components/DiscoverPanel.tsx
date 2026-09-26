import {
	Badge,
	Box,
	Group,
	SegmentedControl,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import type { Seller } from "../derive";
import { miles, money } from "../price";
import type { ItemInfo } from "../types";

type Props = {
	rare: ItemInfo[];
	fresh: ItemInfo[];
	sellers: Record<string, Seller | null> | null;
	onSelect: (name: string) => void;
	onFocusSeller?: (seller: Seller) => void;
};

/** Guest ales sold at a handful of pubs, plus the newest items on the menu. */
export const DiscoverPanel = ({
	rare,
	fresh,
	sellers,
	onSelect,
	onFocusSeller,
}: Props) => {
	const [tab, setTab] = useState<"rare" | "new">(rare.length ? "rare" : "new");
	const items = (tab === "rare" ? rare : fresh).slice(0, 40);
	if (!rare.length && !fresh.length) {
		return null;
	}

	return (
		<>
			<SegmentedControl
				size="xs"
				fullWidth
				value={tab}
				onChange={(value) => setTab(value as "rare" | "new")}
				data={[
					{ label: `Guest ales (${rare.length})`, value: "rare" },
					{ label: `New items (${fresh.length})`, value: "new" },
				]}
			/>
			<Text size="xs" c="dimmed" mt={6}>
				{tab === "rare"
					? "Sold at three pubs or fewer — the regional guest list."
					: "Flagged as new on the menu."}
			</Text>
			<Stack gap={2} mt="xs">
				{items.map((item) => {
					const seller = sellers?.[item.name] ?? null;
					return (
						<UnstyledButton
							key={item.name}
							onClick={() => onSelect(item.name)}
							style={{
								display: "block",
								width: "100%",
								padding: "5px 6px",
								borderRadius: 6,
							}}
						>
							<Group justify="space-between" gap={8} wrap="nowrap">
								<Box style={{ minWidth: 0 }}>
									<Text size="sm" lineClamp={1}>
										{item.name}
									</Text>
									<Text size="xs" c="dimmed" lineClamp={1}>
										{seller
											? `${seller.town ?? seller.name} · ${miles(seller.distance)}`
											: `${item.count} ${item.count === 1 ? "pub" : "pubs"}`}
										{item.menu ? ` · ${item.menu}` : ""}
									</Text>
								</Box>
								<Group gap={4} wrap="nowrap">
									{item.calories ? (
										<Badge size="xs" variant="light" color="gray">
											{item.calories} kcal
										</Badge>
									) : null}
									{seller ? (
										<Text
											size="xs"
											fw={600}
											onClick={(event) => {
												if (onFocusSeller && seller) {
													event.stopPropagation();
													onFocusSeller(seller);
												}
											}}
										>
											{money(seller.price, seller.currency)}
										</Text>
									) : null}
								</Group>
							</Group>
						</UnstyledButton>
					);
				})}
			</Stack>
		</>
	);
};
