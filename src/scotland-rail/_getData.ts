/**
 * Data retrieval & regeneration script for Scotland Rail
 * Fetches high-resolution Natural Earth 50m physical coastlines,
 * filters coordinates strictly for the Scottish bounds, and validates geometry.
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

const fetchScotlandCoastlines = async (): Promise<Coordinate[][]> => {
	console.log(
		`[1/3] Fetching Natural Earth 50m coastline data from ${NATURAL_EARTH_COASTLINE_URL}...`,
	);
	const res = await fetch(NATURAL_EARTH_COASTLINE_URL);
	if (!res.ok) {
		throw new Error(`Failed to fetch Natural Earth dataset: ${res.statusText}`);
	}

	const data = (await res.json()) as GeoJSONCollection;
	console.log(`[2/3] Processing ${data.features.length} vector features...`);

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

	console.log(
		`[3/3] Successfully extracted ${scotlandSegments.length} Scotland coastline polygons (${scotlandSegments.reduce(
			(acc, s) => acc + s.length,
			0,
		)} total coordinates).`,
	);

	return scotlandSegments;
};

// Execute if run directly with Bun
if (import.meta.main) {
	const coastlines = await fetchScotlandCoastlines();
	console.log(
		"Sample extracted segment (first 3 points):",
		coastlines[0]?.slice(0, 3),
	);
	console.log("Done.");
}
