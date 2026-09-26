import { useEffect } from "react";
import {
	CircleMarker,
	MapContainer,
	Popup,
	TileLayer,
	Tooltip,
	useMap,
} from "react-leaflet";
import { miles, money, normalize, type PriceScale, priceColor } from "../price";
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

const VenuePopup = ({ venue }: { venue: PricedVenue }) => (
	<div style={{ minWidth: 200, maxWidth: 260 }}>
		<div style={{ fontWeight: 700, marginBottom: 2 }}>{venue.name}</div>
		<div>
			<strong>{money(venue.price, venue.currency)}</strong> · {venue.portion}
		</div>
		<div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
			{[venue.line1, venue.town, venue.postcode].filter(Boolean).join(", ")}
		</div>
		<div style={{ fontSize: 12, marginTop: 4 }}>
			{venue.isOpenNow ? "🟢 Open now" : "🔴 Closed now"}
			{venue.hoursToday ? ` · ${venue.hoursToday}` : ""}
		</div>
		{venue.facilities.length ? (
			<div style={{ fontSize: 12, marginTop: 4, color: "#444" }}>
				{venue.facilities.slice(0, 5).join(" · ")}
			</div>
		) : null}
		{venue.distance != null ? (
			<div style={{ fontSize: 12, marginTop: 4 }}>
				{miles(venue.distance)} away
			</div>
		) : null}
		{venue.phone ? (
			<a
				href={`tel:${venue.phone.replace(/\s/g, "")}`}
				style={{ fontSize: 12 }}
			>
				{venue.phone}
			</a>
		) : null}
	</div>
);

type Props = {
	venues: PricedVenue[];
	scale: PriceScale;
	focused: PricedVenue | null;
	onFocus: (venue: PricedVenue) => void;
};

export const PriceMap = ({ venues, scale, focused, onFocus }: Props) => (
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
							{money(venue.price, venue.currency)} · {venue.portion}
							{venue.isOpenNow ? " · open" : " · closed"}
						</div>
					</Tooltip>
					<Popup>
						<VenuePopup venue={venue} />
					</Popup>
				</CircleMarker>
			);
		})}
	</MapContainer>
);
