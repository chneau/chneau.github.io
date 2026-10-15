import { useCallback, useState } from "react";
import { type Command, CommandPalette } from "../../shared";
import type { SpoonersSettings } from "../settings";
import { ItemModal } from "./ItemModal";
import { SettingsModal } from "./SettingsModal";
import { ValueExplorer } from "./ValueExplorer";
import { VenueModal } from "./VenueModal";

type Props = {
	venueRef: number | null;
	onVenueChange: (ref: number | null) => void;
	cache: Parameters<typeof VenueModal>[0]["cache"];
	format: Parameters<typeof VenueModal>[0]["format"];
	onOnlyItem: (name: string) => void;
	onAddItem: (name: string) => void;
	valueOpen: boolean;
	onValueClose: () => void;
	settingsOpen: boolean;
	onSettingsClose: () => void;
	settings: SpoonersSettings;
	onSettings: (settings: SpoonersSettings) => void;
	currencies: string[];
	rateDate: string | null;
	rateSource: string;
	ratesLoading: boolean;
	ratesError: string | null;
	onRefreshRates: () => void;
	paletteOpened: boolean;
	onPaletteClose: () => void;
	commands: Command[];
};

export const SpoonerDialogs = ({
	venueRef,
	onVenueChange,
	cache,
	format,
	onOnlyItem,
	onAddItem,
	valueOpen,
	onValueClose,
	settingsOpen,
	onSettingsClose,
	settings,
	onSettings,
	currencies,
	rateDate,
	rateSource,
	ratesLoading,
	ratesError,
	onRefreshRates,
	paletteOpened,
	onPaletteClose,
	commands,
}: Props) => {
	const [itemModal, setItemModal] = useState<string | null>(null);
	const [itemFromVenue, setItemFromVenue] = useState<number | null>(null);

	const openItemFromVenue = useCallback(
		(name: string, from: number | null) => {
			if (from != null) {
				onVenueChange(null);
				setItemFromVenue(from);
			}
			setItemModal(name);
		},
		[onVenueChange],
	);

	const backToVenue = useCallback(() => {
		if (itemFromVenue == null) {
			return;
		}
		setItemModal(null);
		onVenueChange(itemFromVenue);
		setItemFromVenue(null);
	}, [itemFromVenue, onVenueChange]);

	return (
		<>
			<VenueModal
				opened={venueRef != null}
				onClose={() => onVenueChange(null)}
				venueRef={venueRef}
				cache={cache}
				onSelectItem={onOnlyItem}
				onAddItem={onAddItem}
				onItem={(name) => openItemFromVenue(name, venueRef)}
				format={format}
			/>

			<ItemModal
				opened={itemModal != null}
				onClose={() => {
					setItemModal(null);
					setItemFromVenue(null);
				}}
				itemName={itemModal}
				cache={cache}
				onAdd={onAddItem}
				onOnly={onOnlyItem}
				onVenue={(ref) => {
					setItemModal(null);
					setItemFromVenue(null);
					onVenueChange(ref);
				}}
				format={format}
				onBack={itemFromVenue != null ? backToVenue : undefined}
			/>

			<ValueExplorer
				opened={valueOpen}
				onClose={onValueClose}
				cache={cache}
				onItem={(name) => {
					onValueClose();
					setItemModal(name);
				}}
				onVenue={(ref) => {
					onValueClose();
					onVenueChange(ref);
				}}
				format={format}
			/>

			<SettingsModal
				opened={settingsOpen}
				onClose={onSettingsClose}
				settings={settings}
				onChange={onSettings}
				currencies={currencies}
				rateDate={rateDate}
				rateSource={rateSource}
				ratesLoading={ratesLoading}
				ratesError={ratesError}
				onRefreshRates={onRefreshRates}
			/>

			<CommandPalette
				opened={paletteOpened}
				onClose={onPaletteClose}
				commands={commands}
			/>
		</>
	);
};
