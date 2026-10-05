import {
	Badge,
	Button,
	Group,
	Pagination,
	Table,
	Text,
	TextInput,
} from "@mantine/core";
import { Pencil, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getKindColor } from "./birthdays";
import { ConfirmPopover } from "./ConfirmPopover";
import type { RawBirthdayRow } from "./raw-birthday-identity";

/**
 * The searchable, paginated list of stored records.
 *
 * Its own component because the search box, the page window and the row
 * actions form one unit: the page window is only meaningful relative to the
 * filtered list, and the row keys are the reason a legacy duplicate can be
 * edited or deleted at all. None of that belongs to the modal's data actions.
 */
export const ManageRecordsTable = ({
	rows,
	searchQuery,
	filteredCount,
	pageSize,
	pageCount,
	page,
	onSearchChange,
	onPageChange,
	onEdit,
	onDelete,
}: {
	/** The rows on the current page, already filtered and sliced. */
	rows: readonly RawBirthdayRow[];
	searchQuery: string;
	/** How many rows matched the search, across every page. */
	filteredCount: number;
	/** Rows per page; the pagination shows only when the list overflows one page. */
	pageSize: number;
	pageCount: number;
	/** 0-based page index; `Pagination` is 1-based. */
	page: number;
	onSearchChange: (query: string) => void;
	onPageChange: (page: number) => void;
	onEdit: (row: RawBirthdayRow) => void;
	onDelete: (row: RawBirthdayRow) => void;
}) => {
	const { t } = useTranslation();
	// A list that fits on one page is not a truncated list, so it gets no
	// pager — the same condition the modal used before the split.
	const overflowsOnePage = filteredCount > pageSize;

	return (
		<>
			<TextInput
				placeholder={t("manage.search_placeholder")}
				aria-label={t("manage.search_placeholder")}
				leftSection={<Search size={14} />}
				value={searchQuery}
				onChange={(e) => onSearchChange(e.target.value)}
				style={{ width: "100%" }}
			/>

			<Table className="tk-table" verticalSpacing="xs" highlightOnHover>
				<Table.Thead>
					<Table.Tr>
						<Table.Th>{t("manage.col_name")}</Table.Th>
						<Table.Th>{t("manage.col_date")}</Table.Th>
						<Table.Th ta="right">{t("manage.col_actions")}</Table.Th>
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{rows.map((row) => {
						const r = row.record;
						return (
							<Table.Tr key={row.key}>
								<Table.Td>
									<Badge color={getKindColor(r.kind)} variant="light">
										{r.name} {r.kind}
									</Badge>
								</Table.Td>
								<Table.Td>
									<span>📅 {r.date}</span>
								</Table.Td>
								<Table.Td ta="right">
									<Group gap="xs" justify="flex-end" wrap="nowrap">
										<Button
											size="xs"
											variant="default"
											onClick={() => onEdit(row)}
											aria-label={t("manage.edit_aria", { name: r.name })}
										>
											<Pencil size={14} />
										</Button>
										<ConfirmPopover
											title={t("manage.delete_title", { name: r.name })}
											confirmLabel={t("manage.delete_confirm")}
											cancelLabel={t("common.cancel")}
											danger
											onConfirm={() => onDelete(row)}
										>
											<Button
												size="xs"
												variant="default"
												color="red"
												aria-label={t("manage.delete_aria", {
													name: r.name,
												})}
											>
												<Trash2 size={14} />
											</Button>
										</ConfirmPopover>
									</Group>
								</Table.Td>
							</Table.Tr>
						);
					})}
					{rows.length === 0 && (
						<Table.Tr>
							<Table.Td colSpan={3}>
								<Text size="sm" c="dimmed" ta="center" py="md">
									{t("manage.no_results")}
								</Text>
							</Table.Td>
						</Table.Tr>
					)}
				</Table.Tbody>
			</Table>

			{overflowsOnePage && (
				<Group justify="center">
					<Pagination
						size="sm"
						total={pageCount}
						value={page + 1}
						onChange={(next) => onPageChange(next - 1)}
					/>
				</Group>
			)}
		</>
	);
};
