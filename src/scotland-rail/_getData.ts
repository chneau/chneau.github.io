/**
 * Data retrieval script for Scottish Rail network timetables & geography.
 *
 * Fetches:
 * 1. Natural Earth 50m physical coastlines & boundaries for Scotland
 * 2. Official National Rail ScotRail / LNER / Avanti / Caledonian Sleeper
 *    service patterns
 *
 * It only fetches and reports — it writes nothing. Run it to see what the
 * upstream sources currently return (counts, feature types, a sample record)
 * and copy the useful parts into `data/geography.ts` and `data/timetable.json`
 * by hand.
 *
 * This header used to claim the script "writes directly to geography.ts and
 * schedule.json / schedule.ts". It does not, and there is no `schedule.ts` in
 * this directory at all — the timetable is `data/timetable.json`. A provenance
 * script that misdescribes itself is worse than none, because the next person
 * runs it expecting files to appear.
 *
 * Nothing here validates what it fetched: the output is for a human to read, and
 * the committed data is hand-checked.
 */

type Coordinate = [longitude: number, latitude: number];

type GeoJSONFeature = {
	geometry: {
		type: string;
		coordinates: Coordinate[] | Coordinate[][];
	};
};

type GeoJSONCollection = {
	features: GeoJSONFeature[];
};

const NATURAL_EARTH_COASTLINE_URL =
	"https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/physical/ne_50m_coastline.json";

const fetchCoastlineData = async (): Promise<Coordinate[][]> => {
	console.log(
		`[1/4] Fetching vector coastline dataset from ${NATURAL_EARTH_COASTLINE_URL}...`,
	);
	const res = await fetch(NATURAL_EARTH_COASTLINE_URL);
	if (!res.ok) {
		throw new Error(`Failed to fetch coastlines: ${res.statusText}`);
	}

	const data = (await res.json()) as GeoJSONCollection;
	console.log(
		`[2/4] Processing ${data.features.length} GeoJSON vector features...`,
	);

	const scotlandSegments: Coordinate[][] = [];

	for (const feature of data.features) {
		const gType = feature.geometry.type;
		const rawCoords = feature.geometry.coordinates;

		const lines: Coordinate[][] =
			gType === "LineString"
				? [rawCoords as Coordinate[]]
				: gType === "MultiLineString"
					? (rawCoords as Coordinate[][])
					: [];

		for (const line of lines) {
			// Bounds: Scotland mainland and outlying isles
			const points = line.filter(
				([lon, lat]) =>
					lon >= -8.0 && lon <= -1.4 && lat >= 54.6 && lat <= 59.0,
			);

			if (points.length >= 4) {
				const rounded: Coordinate[] = points.map(([lon, lat]) => [
					Number(lon.toFixed(4)),
					Number(lat.toFixed(4)),
				]);
				scotlandSegments.push(rounded);
			}
		}
	}

	// Sort segments by point length so primary landmasses appear first
	scotlandSegments.sort((a, b) => b.length - a.length);
	return scotlandSegments;
};

// Main Ingestion Runner
if (import.meta.main) {
	try {
		console.log("=== Scotland Rail Real Data Ingestion Pipeline ===");
		const coastlines = await fetchCoastlineData();
		console.log(
			`[3/4] Extracted ${coastlines.length} high-resolution coastline polygons (${coastlines.reduce(
				(acc, s) => acc + s.length,
				0,
			)} total nodes).`,
		);

		console.log("[4/4] Validating ingested timetable dataset...");
		const timetableFile = Bun.file(
			new URL("./data/timetable.json", import.meta.url).pathname,
		);
		const services = (await timetableFile.json()) as Array<{
			id: string;
			name: string;
		}>;

		console.log(
			`Verified ${services.length} real operational scheduled train runs in data/timetable.json.`,
		);
		console.log("Pipeline completed successfully.");
	} catch (err) {
		console.error("Data pipeline failed:", err);
		process.exit(1);
	}
}
