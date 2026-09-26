import {
	ActionIcon,
	Badge,
	Box,
	Group,
	Tooltip as MTooltip,
	SegmentedControl,
	Text,
} from "@mantine/core";
import type { Map as LeafletMap } from "leaflet";
import { Crosshair } from "lucide-react";
import { useEffect, useRef } from "react";
import {
	CircleMarker,
	MapContainer,
	Popup,
	TileLayer,
	Tooltip,
	useMap,
	useMapEvents,
} from "react-leaflet";
import { SPOT_META } from "../derive";
import { miles, money, normalize, type PriceScale, priceColor } from "../price";
import type { MapPoint } from "../types";
import { VenueImage } from "./VenueImage";

export const UK_CENTER: [number, number] = [54.4, -3.2];
export const UK_ZOOM = 6;

export type MapView = "pubs" | "area";

/** Smoothly recentre the map when a point is focused from the side panels. */
const FlyTo = ({ point }: { point: MapPoint | null }) => {
	const map = useMap();
	useEffect(() => {
		if (!point) {
			return;
		}
		map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 13), {
			duration: 0.7,
		});
	}, [point, map]);
	return null;
};

/** Report the viewport so it can be put in the URL. */
const Viewport = ({
	onChange,
}: {
	onChange?: (center: [number, number], zoom: number) => void;
}) => {
	useMapEvents({
		moveend(event) {
			const map = event.target;
			const center = map.getCenter();
			onChange?.([center.lat, center.lng], map.getZoom());
		},
	});
	return null;
};

const PointPopup = ({
	point,
	currency,
}: {
	point: MapPoint;
	currency: string;
}) => (
	<div style={{ minWidth: 200, maxWidth: 260 }}>
		{point.images?.[0] ? (
			<div style={{ marginBottom: 6 }}>
				<VenueImage
					src={point.images[0]}
					alt={point.name}
					width="100%"
					height={110}
				/>
			</div>
		) : null}
		<div style={{ fontWeight: 700, marginBottom: 2 }}>{point.name}</div>
		<div>
			<strong>{money(point.price, currency)}</strong>
			{point.label ? ` · ${point.label}` : ""}
		</div>
		{point.previousPrice != null ? (
			<div style={{ fontSize: 12, marginTop: 2 }}>
				was {money(point.previousPrice, currency)}
			</div>
		) : null}
		<div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
			{[point.line1, point.town, point.postcode].filter(Boolean).join(", ")}
		</div>
		{point.hoursToday !== undefined ? (
			<div style={{ fontSize: 12, marginTop: 4 }}>
				{point.isOpenNow ? "🟢 Open now" : "🔴 Closed now"}
				{point.hoursToday ? ` · ${point.hoursToday}` : ""}
			</div>
		) : null}
		{point.spot !== "high-street" || point.canOrder === false ? (
			<div style={{ fontSize: 12, marginTop: 4 }}>
				{point.spot !== "high-street"
					? `${SPOT_META[point.spot].emoji} ${SPOT_META[point.spot].label}`
					: ""}
				{point.canOrder === false
					? `${point.spot !== "high-street" ? " · " : ""}no ordering`
					: ""}
			</div>
		) : null}
		{point.facilities.length ? (
			<div style={{ fontSize: 12, marginTop: 4, opacity: 0.85 }}>
				{point.facilities.slice(0, 5).join(" · ")}
			</div>
		) : null}
		{point.distance != null ? (
			<div style={{ fontSize: 12, marginTop: 4 }}>
				{miles(point.distance)} away
			</div>
		) : null}
		{point.phone ? (
			<a
				href={`tel:${point.phone.replace(/\s/g, "")}`}
				style={{ fontSize: 12 }}
			>
				{point.phone}
			</a>
		) : null}
	</div>
);

type Props = {
	points: MapPoint[];
	/** Pubs with no published menu - drawn as grey hollow markers. */
	unpriced?: MapPoint[];
	scale: PriceScale;
	currency: string;
	focused: MapPoint | null;
	onFocus: (point: MapPoint) => void;
	view: MapView;
	onView?: (view: MapView) => void;
	countLabel?: string;
	/** What the circle colour represents, e.g. "Guinness · Pint" or "4-item round". */
	legendLabel?: string;
	median?: number | null;
	/** Pubs excluded by the round / filters, shown in the legend. */
	hiddenCount?: number;
	onViewport?: (center: [number, number], zoom: number) => void;
	initialView?: { center: [number, number]; zoom: number } | null;
};

export const MapPanel = ({
	points,
	unpriced,
	scale,
	currency,
	focused,
	onFocus,
	view,
	onView,
	countLabel,
	legendLabel,
	median,
	hiddenCount,
	onViewport,
	initialView,
}: Props) => {
	const mapRef = useRef<LeafletMap | null>(null);

	return (
		<Box
			style={{
				position: "relative",
				height: "100%",
				width: "100%",
				// contain Leaflet's z-indexes (its controls go up to 1000) so they can
				// never sit above Mantine portals such as the settings modal
				isolation: "isolate",
				zIndex: 0,
			}}
		>
			<MapContainer
				ref={mapRef}
				className="spooners-map"
				center={initialView?.center ?? UK_CENTER}
				zoom={initialView?.zoom ?? UK_ZOOM}
				scrollWheelZoom
				style={{ height: "100%", width: "100%" }}
			>
				<TileLayer
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
					maxZoom={19}
				/>
				<FlyTo point={focused} />
				<Viewport onChange={onViewport} />
				{unpriced?.map((point) => (
					<CircleMarker
						key={`unpriced-${point.ref}`}
						center={[point.lat, point.lng]}
						radius={4}
						pathOptions={{
							color: "#9aa0a6",
							weight: 1,
							fillColor: "#9aa0a6",
							fillOpacity: 0.15,
							dashArray: "2 2",
						}}
						eventHandlers={{ click: () => onFocus(point) }}
					>
						<Tooltip direction="top" offset={[0, -6]} opacity={1}>
							<div style={{ fontWeight: 600 }}>{point.name}</div>
							<div>no prices published</div>
						</Tooltip>
					</CircleMarker>
				))}
				{points.map((point) => {
					const selected = focused?.ref === point.ref;
					const importance = normalize(point.price, scale);
					return (
						<CircleMarker
							key={`${point.ref}-${point.name}`}
							center={[point.lat, point.lng]}
							radius={selected ? 11 : 5 + importance * 2}
							pathOptions={{
								color: selected ? "#ffffff" : "#0b0f10",
								weight: selected ? 2 : 1,
								fillColor: priceColor(point.price, scale),
								fillOpacity: point.isClosed ? 0.45 : 0.9,
							}}
							eventHandlers={{ click: () => onFocus(point) }}
						>
							<Tooltip direction="top" offset={[0, -6]} opacity={1}>
								<div style={{ fontWeight: 600 }}>{point.name}</div>
								<div>
									{money(point.price, currency)}
									{point.label ? ` · ${point.label}` : ""}
									{point.isOpenNow ? " · open" : " · closed"}
								</div>
							</Tooltip>
							<Popup>
								<PointPopup point={point} currency={currency} />
							</Popup>
						</CircleMarker>
					);
				})}
			</MapContainer>

			{/* overlay: view switch, venue count + reset view */}
			<Group
				gap={6}
				style={{ position: "absolute", top: 10, right: 10, zIndex: 800 }}
			>
				{onView ? (
					<SegmentedControl
						size="xs"
						value={view}
						data={[
							{ label: "Pubs", value: "pubs" },
							{ label: "Areas", value: "area" },
						]}
						onChange={(value) => onView(value as MapView)}
					/>
				) : null}
				<Badge variant="filled" color="dark" size="lg" radius="sm">
					{countLabel ??
						`${points.length} ${points.length === 1 ? "pub" : "pubs"}`}
				</Badge>
				<MTooltip label="Reset view">
					<ActionIcon
						variant="default"
						size="lg"
						aria-label="Reset map view"
						onClick={() => mapRef.current?.setView(UK_CENTER, UK_ZOOM)}
					>
						<Crosshair size={16} />
					</ActionIcon>
				</MTooltip>
			</Group>

			{/* overlay: price legend */}
			<Box
				style={{
					position: "absolute",
					bottom: 12,
					left: 12,
					zIndex: 800,
					width: 190,
					padding: "8px 10px",
					borderRadius: 8,
					background: "var(--mantine-color-body)",
					border: "1px solid var(--mantine-color-default-border)",
					boxShadow: "var(--mantine-shadow-sm)",
				}}
			>
				<Text size="xs" c="dimmed" fw={700} tt="uppercase">
					{view === "area" ? "Area median" : "Price"}
				</Text>
				{legendLabel ? (
					<Text size="xs" c="dimmed" lineClamp={1}>
						circle = {legendLabel}
					</Text>
				) : null}
				<Box
					style={{
						height: 6,
						borderRadius: 999,
						marginTop: 4,
						background: `linear-gradient(90deg, ${priceColor(
							scale.min,
							scale,
						)}, ${priceColor(
							(scale.min + scale.max) / 2,
							scale,
						)}, ${priceColor(scale.max, scale)})`,
					}}
				/>
				<Group justify="space-between" mt={2}>
					<Text size="xs">cheaper</Text>
					<Text size="xs">dearer</Text>
				</Group>
				{median != null ? (
					<Text size="xs" c="dimmed">
						median {money(median, currency)}
					</Text>
				) : null}
				{hiddenCount ? (
					<Text size="xs" c="dimmed">
						{hiddenCount} hidden by round/filters
					</Text>
				) : null}
				{unpriced?.length ? (
					<Text size="xs" c="dimmed">
						○ {unpriced.length} no menu
					</Text>
				) : null}
			</Box>
		</Box>
	);
};
