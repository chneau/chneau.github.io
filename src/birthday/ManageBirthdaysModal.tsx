import { Modal, Stack } from "@mantine/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	addRawBirthday,
	getRawBirthdays,
	type RawBirthday,
	resetRawBirthdays,
	saveRawBirthdays,
} from "./birthdays";
import { BirthdayEditorModal } from "./manage-BirthdayEditorModal";
import { ManageDataActions } from "./manage-DataActions";
import { parseBirthdaysJson } from "./manage-import";
import { ManageRecordsTable } from "./manage-RecordsTable";
import { notify } from "./notify";
import {
	hasDuplicate,
	indexOfOccurrence,
	type RawBirthdayRow,
	withRawKeys,
} from "./raw-birthday-identity";

// Re-exported for the existing importers; the identity rules are pure functions
// over a stored list, and belong beside the reasoning about legacy duplicates
// rather than inside the modal that applies them.
export {
	dedupeRecords,
	hasDuplicate,
	indexOfOccurrence,
	withRawKeys,
} from "./raw-birthday-identity";

type ManageBirthdaysModalProps = {
	open: boolean;
	onClose: () => void;
};

const PAGE_SIZE = 8;

/** The date a fresh "add" form starts on: a plausible year, not today. */
const NEW_RECORD_DATE = "1995-01-01";

/** Which record the add/edit sub-modal is open on. */
type EditingTarget =
	| { readonly isNew: true; readonly record: RawBirthday }
	| { readonly isNew: false; readonly row: RawBirthdayRow };

export const ManageBirthdaysModal = ({
	open,
	onClose,
}: ManageBirthdaysModalProps) => {
	const { t } = useTranslation();
	const [list, setList] = useState<RawBirthday[]>(() => getRawBirthdays());
	// Which row the editor is open on. `new` carries no record at all, so it is
	// a separate case rather than a `RawBirthdayRow` with invented fields.
	const [editing, setEditing] = useState<EditingTarget | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [page, setPage] = useState(0);
	const [pendingImport, setPendingImport] = useState<{
		records: RawBirthday[];
		duplicateCount: number;
	} | null>(null);

	const refreshList = () => {
		setList(getRawBirthdays());
	};

	const handleOpenAdd = () => {
		setEditing({
			isNew: true,
			record: { name: "", date: NEW_RECORD_DATE, kind: "♂️" },
		});
	};

	const handleOpenEdit = (row: RawBirthdayRow) => {
		setEditing({ isNew: false, row });
	};

	const handleSaveDraft = (draft: RawBirthday) => {
		const target = editing;
		// Resolve the edited record against the list as it stands right now, so
		// an edit never falls through to a twin sharing the same identity.
		const current = getRawBirthdays();
		const selfIndex =
			target && !target.isNew
				? indexOfOccurrence(current, target.row.record, target.row.occurrence)
				: -1;

		if (hasDuplicate(current, draft, selfIndex)) {
			return {
				name: t("manage.duplicate_entry", {
					name: draft.name,
					date: draft.date,
				}),
			};
		}

		if (target?.isNew) {
			addRawBirthday(draft);
			notify.success(t("manage.added", { name: draft.name }));
		} else if (target) {
			if (selfIndex < 0) {
				notify.error(t("manage.record_missing"));
				return;
			}
			// Patch that one slot: `updateRawBirthday` in `birthdays.ts` uses
			// `findIndex`, so on legacy duplicates it would rewrite the first
			// match instead of the row the user actually opened.
			const next = [...current];
			next[selfIndex] = draft;
			saveRawBirthdays(next);
			notify.success(t("manage.updated", { name: draft.name }));
		}

		setEditing(null);
		refreshList();
		return undefined;
	};

	const handleDelete = (row: RawBirthdayRow) => {
		const current = getRawBirthdays();
		const index = indexOfOccurrence(current, row.record, row.occurrence);
		if (index < 0) {
			notify.error(t("manage.record_missing"));
			refreshList();
			return;
		}
		// Drop exactly one record: `deleteRawBirthday` in `birthdays.ts` filters
		// out every record matching the identity, which on legacy duplicates
		// would take out the whole group at once.
		const next = current.filter((_, at) => at !== index);
		saveRawBirthdays(next);
		notify.success(t("manage.deleted", { name: row.record.name }));
		refreshList();
	};

	const handleReset = () => {
		resetRawBirthdays();
		notify.info(t("manage.reset_notify"));
		refreshList();
	};

	const handleExportJSON = () => {
		const dataStr =
			"data:text/json;charset=utf-8," +
			encodeURIComponent(JSON.stringify(getRawBirthdays(), null, 2));
		const downloadAnchor = document.createElement("a");
		downloadAnchor.setAttribute("href", dataStr);
		downloadAnchor.setAttribute("download", "birthdays.json");
		document.body.appendChild(downloadAnchor);
		downloadAnchor.click();
		downloadAnchor.remove();
		notify.success(t("manage.exported"));
	};

	const handleReadFile = (text: string) => {
		const parsed = parseBirthdaysJson(text);
		if (!parsed.ok) {
			notify.error(
				parsed.reason === "unreadable"
					? t("manage.import_parse_error")
					: t("manage.import_invalid"),
			);
			return;
		}
		setPendingImport({
			records: parsed.records,
			duplicateCount: parsed.duplicateCount,
		});
	};

	const confirmImport = () => {
		if (!pendingImport) return;
		const { records, duplicateCount } = pendingImport;
		if (records.length === 0) {
			// Only an empty file gets here (dedupe always keeps the first record
			// of an identity). Importing it would silently wipe the list.
			notify.error(t("manage.import_invalid"));
			setPendingImport(null);
			return;
		}
		saveRawBirthdays(records);
		notify.success(t("manage.imported", { count: records.length }));
		if (duplicateCount > 0) {
			notify.warning(
				t("manage.import_duplicates_skipped", { count: duplicateCount }),
			);
		}
		setPendingImport(null);
		refreshList();
	};

	const rows = useMemo(() => withRawKeys(list), [list]);
	const filteredRows = rows.filter((row) =>
		row.record.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount - 1);
	const visibleRows = filteredRows.slice(
		currentPage * PAGE_SIZE,
		(currentPage + 1) * PAGE_SIZE,
	);

	return (
		<Modal title={t("manage.title")} opened={open} onClose={onClose} size="lg">
			<Stack gap="md">
				<ManageDataActions
					pendingImport={
						pendingImport ? { count: pendingImport.records.length } : null
					}
					onAdd={handleOpenAdd}
					onExportJson={handleExportJSON}
					onReadFile={handleReadFile}
					onConfirmImport={confirmImport}
					onCancelImport={() => {
						setPendingImport(null);
					}}
					onReset={handleReset}
				/>

				<ManageRecordsTable
					rows={visibleRows}
					searchQuery={searchQuery}
					filteredCount={filteredRows.length}
					pageSize={PAGE_SIZE}
					pageCount={pageCount}
					page={currentPage}
					onSearchChange={(query) => {
						setSearchQuery(query);
						setPage(0);
					}}
					onPageChange={setPage}
					onEdit={handleOpenEdit}
					onDelete={handleDelete}
				/>
			</Stack>

			{editing && (
				// Keyed on the row's identity so switching rows remounts the form
				// and seeds its fields from the record being edited, rather than
				// leaving the previous row's values on screen.
				<BirthdayEditorModal
					key={editing.isNew ? "new" : editing.row.key}
					target={
						editing.isNew
							? { original: editing.record, occurrence: 0, isNew: true }
							: {
									original: editing.row.record,
									occurrence: editing.row.occurrence,
									isNew: false,
								}
					}
					onSubmit={handleSaveDraft}
					onClose={() => {
						setEditing(null);
					}}
				/>
			)}
		</Modal>
	);
};
