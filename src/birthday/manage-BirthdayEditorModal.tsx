import {
	Button,
	Group,
	Modal,
	SegmentedControl,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RawBirthday } from "./birthdays";
import { ConfirmPopover } from "./ConfirmPopover";

/**
 * The add/edit sub-modal.
 *
 * Its own component because the form is a unit with its own lifecycle: it owns
 * the draft fields, the per-field validation messages, the dirty check that
 * guards a discard, and the "are you sure" popover. The parent above it only
 * ever deals in whole records and never sees a half-typed name.
 *
 * The parent mounts this with a `key` derived from the row being edited, so a
 * fresh open always starts from that record's own values. Seeding the draft
 * from props during render would be a render-phase write to state, and syncing
 * it in an effect would flash the previous row's values first.
 */

type BirthdayDraftErrors = {
	name?: string;
	date?: string;
	kind?: string;
};

/** What the parent's `onSubmit` returns: field errors, or nothing accepted. */
type BirthdayDraftResult = BirthdayDraftErrors | undefined;

/** The row the form is editing, and whether it is a row at all yet. */
type BirthdayEditTarget = {
	original: RawBirthday;
	occurrence: number;
	isNew: boolean;
};

export const BirthdayEditorModal = ({
	target,
	onSubmit,
	onClose,
}: {
	target: BirthdayEditTarget;
	onSubmit: (draft: RawBirthday) => BirthdayDraftResult;
	onClose: () => void;
}) => {
	const { t } = useTranslation();
	const [name, setName] = useState(target.original.name);
	const [date, setDate] = useState<string | null>(target.original.date);
	const [kind, setKind] = useState<RawBirthday["kind"]>(target.original.kind);
	const [errors, setErrors] = useState<BirthdayDraftErrors>({});
	const [discardOpen, setDiscardOpen] = useState(false);

	const isDirty =
		name.trim() !== target.original.name ||
		(date ?? "") !== target.original.date ||
		kind !== target.original.kind;

	const requestClose = () => {
		if (isDirty) {
			setDiscardOpen(true);
		} else {
			onClose();
		}
	};

	const handleSubmit = () => {
		const trimmed = name.trim();
		if (!trimmed) {
			setErrors({ name: t("manage.name_required") });
			return;
		}
		if (!date) {
			setErrors({ date: t("manage.date_required") });
			return;
		}
		if (!kind) {
			setErrors({ kind: t("manage.kind_required") });
			return;
		}

		const result = onSubmit({ name: trimmed, date, kind });
		if (result) {
			setErrors(result);
			return;
		}
		// The parent accepted the record and is closing this modal; clear the
		// validation state so the next open starts clean.
		setErrors({});
	};

	return (
		<Modal
			title={target.isNew ? t("manage.add_title") : t("manage.edit_title")}
			opened
			onClose={requestClose}
			size="md"
		>
			<Stack gap="sm">
				<TextInput
					label={t("manage.name_label")}
					placeholder={t("manage.name_placeholder")}
					value={name}
					error={errors.name}
					onChange={(e) => setName(e.target.value)}
				/>
				<DatePickerInput
					label={t("manage.date_label")}
					valueFormat="YYYY-MM-DD"
					value={date}
					error={errors.date}
					onChange={setDate}
				/>
				<div>
					<Text size="sm" fw={500} mb={4}>
						{t("manage.category")}
					</Text>
					<SegmentedControl
						fullWidth
						value={kind}
						onChange={(value) => setKind(value as RawBirthday["kind"])}
						data={[
							{ label: t("manage.boy"), value: "♂️" },
							{ label: t("manage.girl"), value: "♀️" },
							{ label: t("manage.wedding"), value: "💒" },
						]}
					/>
					{errors.kind && (
						<Text size="xs" c="red" mt={4}>
							{errors.kind}
						</Text>
					)}
				</div>
				<Group justify="flex-end" mt="sm">
					<ConfirmPopover
						title={t("manage.discard_title")}
						confirmLabel={t("manage.discard_confirm")}
						cancelLabel={t("common.cancel")}
						danger
						opened={discardOpen}
						onOpenChange={(next) => {
							if (!next) setDiscardOpen(false);
						}}
						onConfirm={onClose}
					>
						<Button variant="default" onClick={requestClose}>
							{t("common.cancel")}
						</Button>
					</ConfirmPopover>
					<Button onClick={handleSubmit}>{t("manage.save")}</Button>
				</Group>
			</Stack>
		</Modal>
	);
};
