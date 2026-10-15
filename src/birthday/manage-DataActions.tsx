import { Button, Group } from "@mantine/core";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmPopover } from "./ConfirmPopover";
import { notify } from "./notify";

export const ManageDataActions = ({
	pendingImport,
	onAdd,
	onExportJson,
	onReadFile,
	onConfirmImport,
	onCancelImport,
	onReset,
}: {
	pendingImport: { readonly count: number } | null;
	onAdd: () => void;
	onExportJson: () => void;
	onReadFile: (text: string) => void;
	onConfirmImport: () => void;
	onCancelImport: () => void;
	onReset: () => void;
}) => {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [reading, setReading] = useState(false);

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
						event.target.value = "";
						if (!file) return;
						const reader = new FileReader();
						reader.readAsText(file, "UTF-8");
						reader.onload = (loaded) => {
							setReading(false);
							onReadFile(String(loaded.target?.result ?? ""));
						};
						reader.onerror = () => {
							setReading(false);
							notify.error(t("manage.import_read_error"));
						};
						setReading(true);
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
						loading={reading}
						disabled={reading}
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
