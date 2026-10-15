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
import "leaflet/dist/leaflet.css";
import { ChevronRight, Circle, Crosshair, Info, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	CircleMarker,
	MapContainer,
	Popup,
	TileLayer,
	Tooltip,
	useMap,
	useMapEvents,
} from "react-leaflet";
import { StatusDot } from "../../shared";
import { type MapView, UK_CENTER, UK_ZOOM } from "../mapView";
import { miles, money, normalize, type PriceScale, priceColor } from "../price";
import type { MapPoint } from "../types";
import { SpotLabel } from "./SpotLabel";
import { VenueImage } from "./VenueImage";

const FlyTo = ({ point }: { point: MapPoint | null }) => {
	const map = useMap();
	useEffect(() => {
		if (!point) {
			return;
		}
		const target = point.kind === "area" ? 11 : 13;
		map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), target), {
			duration: 0.7,
		});
	}, [point, map]);
	return null;
};

const FitOnView = ({ view, points }: { view: MapView; points: MapPoint[] }) => {
	const map = useMap();
	const fitToPoints = useEffectEvent(() => {
		if (points.length < 2) {
			return;
		}
		map.fitBounds(
			points.map((point) => [point.lat, point.lng] as [number, number]),
			{ padding: [40, 40], maxZoom: 12 },
		);
	});
	useEffect(() => {
		if (view !== "area") return;
		fitToPoints();
	}, [view]);
	return null;
};

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

const PopupAction = ({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) => (
	<button
		type="button"
		onClick={(event) => {
			event.stopPropagation();
			onClick();
		}}
		style={{
			marginTop: 8,
			width: "100%",
			padding: "5px 8px",
			borderRadius: 6,
			border: "1px solid var(--mantine-color-default-border)",
			background: "var(--mantine-color-default)",
			color: "inherit",
			cursor: "pointer",
			fontSize: 12,
			fontWeight: 600,
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 6,
		}}
	>
		<span>{label}</span>
		<ChevronRight size={12} />
	</button>
);

const DetailsButton = ({
	point,
	onOpen,
}: {
	point: MapPoint;
	onOpen?: (ref: number) => void;
}) =>
	onOpen ? (
		<PopupAction label="Pub details" onClick={() => onOpen(point.ref)} />
	) : null;

const AreaPopup = ({
	point,
	currency,
	onArea,
}: {
	point: MapPoint;
	currency: string;
	onArea?: (name: string) => void;
}) => (
	<div style={{ minWidth: 180 }}>
		<div style={{ fontWeight: 700, marginBottom: 2 }}>{point.name}</div>
		<div>
			<strong>{money(point.price, currency)}</strong> median
			{point.label ? ` · ${point.label}` : ""}
		</div>
		{onArea ? (
			<PopupAction label="Show these pubs" onClick={() => onArea(point.name)} />
		) : null}
	</div>
);

const OpeningToday = ({ point }: { point: MapPoint }) =>
	point.hoursToday !== undefined ? (
		<div style={{ fontSize: 12, marginTop: 4 }}>
			<StatusDot on={point.isOpenNow} />
			{point.isOpenNow ? "Open now" : "Closed now"}
			{point.hoursToday ? ` · ${point.hoursToday}` : ""}
		</div>
	) : null;

const SpotAndOrdering = ({ point }: { point: MapPoint }) =>
	point.spot !== "high-street" || point.canOrder === false ? (
		<div style={{ fontSize: 12, marginTop: 4 }}>
			{point.spot !== "high-street" ? <SpotLabel spot={point.spot} /> : null}
			{point.canOrder === false
				? `${point.spot !== "high-street" ? " · " : ""}no ordering`
				: ""}
		</div>
	) : null;

const PubPopup = ({
	point,
	currency,
	onOpen,
}: {
	point: MapPoint;
	currency: string;
	onOpen?: (ref: number) => void;
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
		<OpeningToday point={point} />
		<SpotAndOrdering point={point} />
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
		<DetailsButton point={point} onOpen={onOpen} />
	</div>
);

const PointPopup = ({
	point,
	currency,
	onOpen,
	onArea,
}: {
	point: MapPoint;
	currency: string;
	onOpen?: (ref: number) => void;
	onArea?: (name: string) => void;
}) =>
	point.kind === "area" ? (
		<AreaPopup point={point} currency={currency} onArea={onArea} />
	) : (
		<PubPopup point={point} currency={currency} onOpen={onOpen} />
	);

type Props = {
	points: MapPoint[];
	unpriced?: MapPoint[];
	scale: PriceScale;
	currency: string;
	focused: MapPoint | null;
	onFocus: (point: MapPoint) => void;
	view: MapView;
	onView?: (view: MapView) => void;
	onOpen?: (ref: number) => void;
	onArea?: (name: string) => void;
	area?: string | null;
	compact?: boolean;
	onClearArea?: () => void;
	countLabel?: string;
	legendLabel?: string;
	median?: number | null;
	hiddenCount?: number;
	onViewport?: (center: [number, number], zoom: number) => void;
	initialView?: { center: [number, number]; zoom: number } | null;
};

const UnpricedMarkers = ({
	points,
	onFocus,
	onOpen,
}: {
	points: MapPoint[];
	onFocus: (point: MapPoint) => void;
	onOpen?: (ref: number) => void;
}) => (
	<>
		{points.map((point) => (
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
				<Popup>
					<div style={{ minWidth: 180 }}>
						<div style={{ fontWeight: 700, marginBottom: 2 }}>{point.name}</div>
						<div style={{ fontSize: 12, opacity: 0.7 }}>
							{[point.town, point.postcode].filter(Boolean).join(", ")}
						</div>
						<div style={{ fontSize: 12, marginTop: 4 }}>
							no prices published
						</div>
						<DetailsButton point={point} onOpen={onOpen} />
					</div>
				</Popup>
			</CircleMarker>
		))}
	</>
);

const PricedMarkers = ({
	points,
	scale,
	currency,
	focused,
	onFocus,
	onOpen,
	onArea,
}: {
	points: MapPoint[];
	scale: PriceScale;
	currency: string;
	focused: MapPoint | null;
	onFocus: (point: MapPoint) => void;
	onOpen?: (ref: number) => void;
	onArea?: (name: string) => void;
}) => (
	<>
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
					eventHandlers={{
						click: () => {
							if (point.kind !== "area") {
								onFocus(point);
							}
						},
					}}
				>
					<Tooltip direction="top" offset={[0, -6]} opacity={1}>
						<div style={{ fontWeight: 600 }}>{point.name}</div>
						<div>
							{money(point.price, currency)}
							{point.label ? ` · ${point.label}` : ""}
							{point.kind === "area"
								? ""
								: point.isOpenNow
									? " · open"
									: " · closed"}
						</div>
					</Tooltip>
					<Popup>
						<PointPopup
							point={point}
							currency={currency}
							onOpen={onOpen}
							onArea={onArea}
						/>
					</Popup>
				</CircleMarker>
			);
		})}
	</>
);

const MapControls = ({
	points,
	view,
	onView,
	area,
	onClearArea,
	countLabel,
	onReset,
}: {
	points: MapPoint[];
	view: MapView;
	onView?: (view: MapView) => void;
	area?: string | null;
	onClearArea?: () => void;
	countLabel?: string;
	onReset: () => void;
}) => (
	<Group
		gap={6}
		style={{ position: "absolute", top: 10, right: 10, zIndex: 800 }}
	>
		{area ? (
			<Badge
				variant="light"
				color="teal"
				size="lg"
				radius="sm"
				rightSection={
					onClearArea ? (
						<ActionIcon
							size="xs"
							variant="transparent"
							color="teal"
							aria-label="Clear area filter"
							onClick={onClearArea}
						>
							<X size={12} />
						</ActionIcon>
					) : null
				}
			>
				Showing pubs in {area}
			</Badge>
		) : null}
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
			{countLabel ?? `${points.length} ${points.length === 1 ? "pub" : "pubs"}`}
		</Badge>
		<MTooltip label="Reset view">
			<ActionIcon
				variant="default"
				size="lg"
				aria-label="Reset map view"
				onClick={onReset}
			>
				<Crosshair size={16} />
			</ActionIcon>
		</MTooltip>
	</Group>
);

const PriceRamp = ({ scale }: { scale: PriceScale }) => (
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
);

const LegendBody = ({
	view,
	scale,
	currency,
	legendLabel,
	median,
	hiddenCount,
	unpricedCount,
	onHide,
}: {
	view: MapView;
	scale: PriceScale;
	currency: string;
	legendLabel?: string;
	median?: number | null;
	hiddenCount?: number;
	unpricedCount: number;
	onHide?: () => void;
}) => (
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
		<PriceRamp scale={scale} />
		<Group justify="space-between" mt={2}>
			<Text size="xs">cheaper</Text>
			<Text size="xs">dearer</Text>
		</Group>
		<Text size="xs" c="dimmed">
			size &amp; colour = price
		</Text>
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
		{unpricedCount ? (
			<Text
				size="xs"
				c="dimmed"
				style={{ display: "flex", alignItems: "center", gap: 4 }}
			>
				<Circle size={9} /> {unpricedCount} no menu
			</Text>
		) : null}
		{onHide ? (
			<ActionIcon
				variant="subtle"
				color="gray"
				size="xs"
				aria-label="Hide map legend"
				style={{ position: "absolute", top: 4, right: 4 }}
				onClick={onHide}
			>
				<X size={12} />
			</ActionIcon>
		) : null}
	</Box>
);

const MapLegend = ({
	open,
	onShow,
	...legend
}: {
	open: boolean;
	onShow: () => void;
	onHide?: () => void;
	view: MapView;
	scale: PriceScale;
	currency: string;
	legendLabel?: string;
	median?: number | null;
	hiddenCount?: number;
	unpricedCount: number;
}) =>
	open ? (
		<LegendBody {...legend} />
	) : (
		<ActionIcon
			variant="default"
			size="lg"
			aria-label="Show map legend"
			style={{ position: "absolute", bottom: 12, left: 12, zIndex: 800 }}
			onClick={onShow}
		>
			<Info size={16} />
		</ActionIcon>
	);

export const MapPanel = ({
	points,
	unpriced,
	scale,
	currency,
	focused,
	onFocus,
	view,
	onView,
	onOpen,
	onArea,
	area,
	onClearArea,
	compact,
	countLabel,
	legendLabel,
	median,
	hiddenCount,
	onViewport,
	initialView,
}: Props) => {
	const mapRef = useRef<LeafletMap | null>(null);
	const [legendOverride, setLegendOverride] = useState<boolean | null>(null);
	const legendOpen = !compact || (legendOverride ?? false);

	return (
		<Box
			style={{
				position: "relative",
				height: "100%",
				width: "100%",
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
				<FitOnView view={view} points={points} />
				<Viewport onChange={onViewport} />
				<UnpricedMarkers
					points={unpriced ?? []}
					onFocus={onFocus}
					onOpen={onOpen}
				/>
				<PricedMarkers
					points={points}
					scale={scale}
					currency={currency}
					focused={focused}
					onFocus={onFocus}
					onOpen={onOpen}
					onArea={onArea}
				/>
			</MapContainer>

			<MapControls
				points={points}
				view={view}
				onView={onView}
				area={area}
				onClearArea={onClearArea}
				countLabel={countLabel}
				onReset={() => mapRef.current?.setView(UK_CENTER, UK_ZOOM)}
			/>

			<MapLegend
				open={legendOpen}
				onShow={() => setLegendOverride(true)}
				onHide={compact ? () => setLegendOverride(false) : undefined}
				view={view}
				scale={scale}
				currency={currency}
				legendLabel={legendLabel}
				median={median}
				hiddenCount={hiddenCount}
				unpricedCount={unpriced?.length ?? 0}
			/>
		</Box>
	);
};
