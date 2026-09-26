import { useEffect } from "react";
import {
	CircleMarker,
	MapContainer,
	TileLayer,
	Tooltip,
	useMap,
} from "react-leaflet";
import { money, normalize, type PriceScale, priceColor } from "../price";
import type { PricedVenue } from "../types";

const UK_CENTER: [number, number] = [54.4, -3.2];

/** Smoothly recentre the map when a venue is focused from the side panels. */
const FlyTo = ({ venue }: { venue: PricedVenue | null }) => {
	const map = useMap();
	useEffect(() => {
		if (!venue) {
			return;
		}
		map.flyTo([venue.lat, venue.lng], Math.max(map.getZoom(), 13), {
			duration: 0.7,
		});
	}, [venue, map]);
	return null;
};

type Props = {
	venues: PricedVenue[];
	scale: PriceScale;
	currency: string;
	focused: PricedVenue | null;
	onFocus: (venue: PricedVenue) => void;
};

export const PriceMap = ({
	venues,
	scale,
	currency,
	focused,
	onFocus,
}: Props) => (
	<MapContainer
		className="spooners-map"
		center={UK_CENTER}
		zoom={6}
		scrollWheelZoom
		style={{ height: "100%", width: "100%" }}
	>
		<TileLayer
			attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
			url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
			maxZoom={19}
		/>
		<FlyTo venue={focused} />
		{venues.map((venue) => {
			const selected = focused?.ref === venue.ref;
			const importance = normalize(venue.price, scale);
			return (
				<CircleMarker
					key={venue.ref}
					center={[venue.lat, venue.lng]}
					radius={selected ? 11 : 5 + importance * 2}
					pathOptions={{
						color: selected ? "#ffffff" : "#0b0f10",
						weight: selected ? 2 : 1,
						fillColor: priceColor(venue.price, scale),
						fillOpacity: venue.isClosed ? 0.45 : 0.9,
					}}
					eventHandlers={{ click: () => onFocus(venue) }}
				>
					<Tooltip direction="top" offset={[0, -6]} opacity={1}>
						<div style={{ fontWeight: 600 }}>{venue.name}</div>
						<div>
							{money(venue.price, currency)}
							{venue.town ? ` · ${venue.town}` : ""}
							{venue.isClosed ? " · closed" : ""}
						</div>
					</Tooltip>
				</CircleMarker>
			);
		})}
	</MapContainer>
);
