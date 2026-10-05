import { Button, Group } from "@mantine/core";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmPopover } from "./ConfirmPopover";

/**
 * The modal's data actions: add, export, import, reset.
 *
 * Its own component because the import is a multi-step flow of its own — pick
 * a file, read it, ask what will happen, confirm — and none of that belongs to
 * the list below it. The parent sees only whole strings and whole callbacks,
 * never a `FileReader`.
 */
export const ManageDataActions = ({
	pendingImport,
	onAdd,
	onExportJson,
	onReadFile,
	onConfirmImport,
	onCancelImport,
	onReset,
}: {
	/** `null` when no file is waiting for confirmation. */
	pendingImport: { readonly count: number } | null;
	onAdd: () => void;
	onExportJson: () => void;
	/** Receives the raw text of the chosen file. */
	onReadFile: (text: string) => void;
	onConfirmImport: () => void;
	onCancelImport: () => void;
	onReset: () => void;
}) => {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);

	return (
		<Group justify="space-between" align="center" wrap="wrap">
			<Group wrap="wrap">
				<Button leftSection={<Plus size={16} />} onClick={onAdd}>
					{t("manage.add")}
				</Button>
				<Button
					variant="default"
					leftSection={<Download size={16} />}
					onClick={onExportJson}
				>
					{t("manage.export_json")}
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					accept=".json"
					onChange={(event) => {
						const file = event.target.files?.[0];
						// Clear the input so selecting the same file again still
						// fires onChange.
						event.target.value = "";
						if (!file) return;
						const reader = new FileReader();
						reader.readAsText(file, "UTF-8");
						reader.onload = (loaded) => {
							onReadFile(String(loaded.target?.result ?? ""));
						};
					}}
					style={{ display: "none" }}
				/>
				<ConfirmPopover
					title={t("manage.import_title", {
						count: pendingImport?.count ?? 0,
					})}
					confirmLabel={t("manage.import_confirm")}
					cancelLabel={t("common.cancel")}
					danger
					opened={pendingImport !== null}
					onOpenChange={(next) => {
						if (!next) {
							onCancelImport();
						}
					}}
					onConfirm={onConfirmImport}
				>
					<Button
						variant="default"
						leftSection={<Upload size={16} />}
						onClick={() => fileInputRef.current?.click()}
					>
						{t("manage.import_json")}
					</Button>
				</ConfirmPopover>
			</Group>
			<ConfirmPopover
				title={t("manage.reset_title")}
				confirmLabel={t("manage.reset_confirm")}
				cancelLabel={t("common.cancel")}
				danger
				onConfirm={onReset}
			>
				<Button
					variant="default"
					color="red"
					leftSection={<RefreshCw size={16} />}
				>
					{t("manage.reset_defaults")}
				</Button>
			</ConfirmPopover>
		</Group>
	);
};
