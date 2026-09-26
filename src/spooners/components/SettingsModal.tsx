import {
	Alert,
	Badge,
	Button,
	Divider,
	Group,
	Modal,
	Select,
	Stack,
	Switch,
	Text,
} from "@mantine/core";
import { RefreshCw } from "lucide-react";
import { currencySelectOptions } from "../rates";
import type { SpoonersSettings } from "../settings";

type Props = {
	opened: boolean;
	onClose: () => void;
	settings: SpoonersSettings;
	onChange: (settings: SpoonersSettings) => void;
	/** Currency codes offered for conversion (GBP, EUR, USD, ...). */
	currencies: string[];
	rateDate: string | null;
	rateSource: string;
	ratesLoading: boolean;
	ratesError: string | null;
	onRefreshRates: () => void;
};

const ROW_OPTIONS = [5, 8, 12, 20].map((value) => ({
	value: String(value),
	label: `${value} pubs`,
}));

export const SettingsModal = ({
	opened,
	onClose,
	settings,
	onChange,
	currencies,
	rateDate,
	rateSource,
	ratesLoading,
	ratesError,
	onRefreshRates,
}: Props) => (
	<Modal opened={opened} onClose={onClose} title="Settings" centered size="md">
		<Stack gap="md">
			<Select
				label="Prices shown in"
				description="Convert every pub into one currency, or leave each pub in its own."
				data={[
					{
						value: "native",
						label: "Native — each pub in its own currency",
					},
					...currencySelectOptions(currencies),
				]}
				value={settings.currency}
				onChange={(value) =>
					onChange({ ...settings, currency: value ?? "native" })
				}
				searchable
				nothingFoundMessage="No currency matched that"
				allowDeselect={false}
				checkIconPosition="right"
			/>

			<Switch
				label="Open now only by default"
				checked={settings.openNow}
				onChange={(event) =>
					onChange({ ...settings, openNow: event.currentTarget.checked })
				}
			/>

			<Switch
				label="Hide airport & travel venues by default"
				checked={settings.hideSpecial}
				onChange={(event) =>
					onChange({ ...settings, hideSpecial: event.currentTarget.checked })
				}
			/>

			<Switch
				label="Hide temporarily closed pubs by default"
				checked={settings.hideClosed}
				onChange={(event) =>
					onChange({ ...settings, hideClosed: event.currentTarget.checked })
				}
			/>

			<Select
				label="Ranking list length"
				data={ROW_OPTIONS}
				value={String(settings.rankingRows)}
				onChange={(value) =>
					onChange({ ...settings, rankingRows: Number(value ?? 12) })
				}
				allowDeselect={false}
			/>

			<Divider />

			<Group justify="space-between" align="center">
				<Text size="sm" fw={500}>
					Exchange rates
				</Text>
				<Button
					size="xs"
					variant="light"
					leftSection={<RefreshCw size={14} />}
					loading={ratesLoading}
					onClick={onRefreshRates}
				>
					Refresh
				</Button>
			</Group>
			<Group gap={6} align="center">
				<Badge variant="light" color="blue">
					{rateDate ? `rates of ${rateDate}` : "not loaded yet"}
				</Badge>
				<Text size="xs" c="dimmed">
					{rateSource}
				</Text>
			</Group>
			<Alert
				variant="light"
				color="yellow"
				icon={null}
				p="xs"
				hidden={!ratesError}
			>
				<Text size="xs">
					Could not load exchange rates, so prices stay in their native
					currency.
				</Text>
			</Alert>
			<Text size="xs" c="dimmed">
				Conversions use daily reference rates and are indicative only — the
				price a pub charges is the one in its own currency.
			</Text>
		</Stack>
	</Modal>
);
