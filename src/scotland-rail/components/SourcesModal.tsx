import {
	Anchor,
	Button,
	Code,
	Divider,
	Group,
	Modal,
	Text,
	Title,
} from "@mantine/core";
import { CATEGORIES } from "../data/types";
import { palette } from "../theme";

export const SourcesModal = ({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) => (
	<Modal
		title="Data Sources & Method"
		opened={open}
		onClose={onClose}
		styles={{
			body: {
				color: palette.text,
			},
			header: {
				background: "transparent",
				color: palette.text,
			},
		}}
	>
		<Text style={{ color: palette.textMuted }}>
			<strong>A Day in Scottish Rail</strong> is an interactive 24-hour
			simulation reconstructing passenger train activity across Scotland's
			national and regional rail network.
		</Text>

		<Divider
			style={{
				borderColor: "rgba(255,255,255,0.15)",
				margin: "12px 0",
			}}
		/>

		<Title order={5} style={{ color: palette.accent, marginTop: 0 }}>
			Geospatial & Cartographic Data
		</Title>
		<ul style={{ color: palette.textMuted, paddingLeft: 20 }}>
			<li>
				<strong>Coastlines & Islands:</strong>{" "}
				<Anchor
					href="https://www.naturalearthdata.com/downloads/50m-physical-vectors/"
					target="_blank"
					rel="noreferrer"
					style={{ color: palette.accent }}
				>
					Natural Earth 50m Physical Vectors
				</Anchor>{" "}
				(Ingested via{" "}
				<Code
					style={{
						color: palette.accent,
						background: "rgba(255,255,255,0.1)",
					}}
				>
					_getData.ts
				</Code>
				).
			</li>
			<li>
				<strong>Rail Network & Alignment:</strong>{" "}
				<Anchor
					href="https://www.openrailwaymap.org/"
					target="_blank"
					rel="noreferrer"
					style={{ color: palette.accent }}
				>
					OpenRailwayMap
				</Anchor>{" "}
				&{" "}
				<Anchor
					href="https://www.openstreetmap.org/"
					target="_blank"
					rel="noreferrer"
					style={{ color: palette.accent }}
				>
					OpenStreetMap
				</Anchor>{" "}
				(ODbL Open Database License).
			</li>
		</ul>

		<Title order={5} style={{ color: palette.accent, marginTop: 16 }}>
			Official Timetable & Schedule Feeds
		</Title>
		<ul style={{ color: palette.textMuted, paddingLeft: 20 }}>
			<li>
				<strong>National Rail & Operator Feeds:</strong> Real-world operational
				timetables compiled from:
				<ul style={{ marginTop: 4 }}>
					<li>
						<Anchor
							href="https://www.scotrail.co.uk/plan-your-journey/timetables"
							target="_blank"
							rel="noreferrer"
							style={{ color: palette.accent }}
						>
							ScotRail Official Timetable Publications
						</Anchor>{" "}
						(Central Belt, Highland Mainline, West Highland, Far North, Borders)
					</li>
					<li>
						<Anchor
							href="https://www.lner.co.uk/travel-information/travelling-now/travel-updates/timetables/"
							target="_blank"
							rel="noreferrer"
							style={{ color: CATEGORIES.CrossBorder.color }}
						>
							LNER Timetable Feed
						</Anchor>{" "}
						(London King's Cross to Edinburgh, Highland Chieftain to Inverness,
						Northern Lights to Aberdeen)
					</li>
					<li>
						<Anchor
							href="https://www.sleeper.co.uk/timetables/"
							target="_blank"
							rel="noreferrer"
							style={{ color: CATEGORIES.Sleeper.color }}
						>
							Caledonian Sleeper Timetables
						</Anchor>{" "}
						(Overnight Lowland & Highland sleeper paths)
					</li>
					<li>
						<Anchor
							href="https://www.avantiwestcoast.co.uk/travel-information/timetables"
							target="_blank"
							rel="noreferrer"
							style={{ color: palette.accent }}
						>
							Avanti West Coast
						</Anchor>{" "}
						&{" "}
						<Anchor
							href="https://www.crosscountrytrains.co.uk/travel-updates-information/timetables"
							target="_blank"
							rel="noreferrer"
							style={{ color: palette.accent }}
						>
							CrossCountry
						</Anchor>
					</li>
				</ul>
			</li>
			<li>
				<strong>Data Ingestion:</strong> Ingested into static JSON dataset (
				<Code
					style={{
						color: palette.accent,
						background: "rgba(255,255,255,0.1)",
					}}
				>
					data/timetable.json
				</Code>
				) via{" "}
				<Code
					style={{
						color: palette.accent,
						background: "rgba(255,255,255,0.1)",
					}}
				>
					_getData.ts
				</Code>
				.
			</li>
		</ul>

		<Divider
			style={{
				borderColor: "rgba(255,255,255,0.15)",
				margin: "12px 0",
			}}
		/>

		<Text
			size="sm"
			c="dimmed"
			style={{ fontSize: "0.8rem", color: palette.textFaint }}
		>
			Built with React 19, Mantine, and Canvas 2D. Inspired by the{" "}
			<Anchor
				href="https://white-smoke-0b215f103.7.azurestaticapps.net/"
				target="_blank"
				rel="noreferrer"
				style={{ color: palette.accent }}
			>
				A Day in Irish Rail
			</Anchor>{" "}
			replay simulation project.
		</Text>

		<Group justify="flex-end" mt="md">
			<Button variant="filled" onClick={onClose}>
				Close
			</Button>
		</Group>
	</Modal>
);
