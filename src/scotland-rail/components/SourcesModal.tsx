import { Button, Divider, Modal, Typography } from "antd";

const { Title, Paragraph, Text, Link } = Typography;

export const SourcesModal = ({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) => (
	<Modal
		title="Data Sources & Method"
		open={open}
		onOk={onClose}
		onCancel={onClose}
		footer={[
			<Button key="close" type="primary" onClick={onClose}>
				Close
			</Button>,
		]}
		styles={{
			body: {
				color: "#edf3f5",
			},
			header: {
				background: "transparent",
				color: "#edf3f5",
			},
		}}
	>
		<Paragraph style={{ color: "#d9e2e6" }}>
			<strong>A Day in Scottish Rail</strong> is an interactive 24-hour
			simulation reconstructing passenger train activity across Scotland's
			national and regional rail network.
		</Paragraph>

		<Divider
			style={{
				borderColor: "rgba(255,255,255,0.15)",
				margin: "12px 0",
			}}
		/>

		<Title level={5} style={{ color: "#59d7ff", marginTop: 0 }}>
			Geospatial & Cartographic Data
		</Title>
		<ul style={{ color: "#d9e2e6", paddingLeft: 20 }}>
			<li>
				<strong>Coastlines & Islands:</strong>{" "}
				<Link
					href="https://www.naturalearthdata.com/downloads/50m-physical-vectors/"
					target="_blank"
					rel="noreferrer"
					style={{ color: "#59d7ff" }}
				>
					Natural Earth 50m Physical Vectors
				</Link>{" "}
				(Ingested via{" "}
				<Text
					code
					style={{
						color: "#59d7ff",
						background: "rgba(255,255,255,0.1)",
					}}
				>
					_getData.ts
				</Text>
				).
			</li>
			<li>
				<strong>Rail Network & Alignment:</strong>{" "}
				<Link
					href="https://www.openrailwaymap.org/"
					target="_blank"
					rel="noreferrer"
					style={{ color: "#59d7ff" }}
				>
					OpenRailwayMap
				</Link>{" "}
				&{" "}
				<Link
					href="https://www.openstreetmap.org/"
					target="_blank"
					rel="noreferrer"
					style={{ color: "#59d7ff" }}
				>
					OpenStreetMap
				</Link>{" "}
				(ODbL Open Database License).
			</li>
		</ul>

		<Title level={5} style={{ color: "#59d7ff", marginTop: 16 }}>
			Official Timetable & Schedule Feeds
		</Title>
		<ul style={{ color: "#d9e2e6", paddingLeft: 20 }}>
			<li>
				<strong>National Rail & Operator Feeds:</strong> Real-world operational
				timetables compiled from:
				<ul style={{ marginTop: 4 }}>
					<li>
						<Link
							href="https://www.scotrail.co.uk/plan-your-journey/timetables"
							target="_blank"
							rel="noreferrer"
							style={{ color: "#59d7ff" }}
						>
							ScotRail Official Timetable Publications
						</Link>{" "}
						(Central Belt, Highland Mainline, West Highland, Far North, Borders)
					</li>
					<li>
						<Link
							href="https://www.lner.co.uk/travel-information/travelling-now/travel-updates/timetables/"
							target="_blank"
							rel="noreferrer"
							style={{ color: "#b347ff" }}
						>
							LNER Timetable Feed
						</Link>{" "}
						(London King's Cross to Edinburgh, Highland Chieftain to Inverness,
						Northern Lights to Aberdeen)
					</li>
					<li>
						<Link
							href="https://www.sleeper.co.uk/timetables/"
							target="_blank"
							rel="noreferrer"
							style={{ color: "#ff2bd6" }}
						>
							Caledonian Sleeper Timetables
						</Link>{" "}
						(Overnight Lowland & Highland sleeper paths)
					</li>
					<li>
						<Link
							href="https://www.avantiwestcoast.co.uk/travel-information/timetables"
							target="_blank"
							rel="noreferrer"
							style={{ color: "#59d7ff" }}
						>
							Avanti West Coast
						</Link>{" "}
						&{" "}
						<Link
							href="https://www.crosscountrytrains.co.uk/travel-updates-information/timetables"
							target="_blank"
							rel="noreferrer"
							style={{ color: "#59d7ff" }}
						>
							CrossCountry
						</Link>
					</li>
				</ul>
			</li>
			<li>
				<strong>Data Ingestion:</strong> Ingested into static JSON dataset (
				<Text
					code
					style={{
						color: "#59d7ff",
						background: "rgba(255,255,255,0.1)",
					}}
				>
					data/timetable.json
				</Text>
				) via{" "}
				<Text
					code
					style={{
						color: "#59d7ff",
						background: "rgba(255,255,255,0.1)",
					}}
				>
					_getData.ts
				</Text>
				.
			</li>
		</ul>

		<Divider
			style={{
				borderColor: "rgba(255,255,255,0.15)",
				margin: "12px 0",
			}}
		/>

		<Text type="secondary" style={{ fontSize: "0.8rem", color: "#8ca0aa" }}>
			Built with React 19, Ant Design, and Canvas 2D. Inspired by the{" "}
			<Link
				href="https://white-smoke-0b215f103.7.azurestaticapps.net/"
				target="_blank"
				rel="noreferrer"
				style={{ color: "#59d7ff" }}
			>
				A Day in Irish Rail
			</Link>{" "}
			replay simulation project.
		</Text>
	</Modal>
);
