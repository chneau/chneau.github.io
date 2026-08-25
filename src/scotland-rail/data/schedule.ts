import { RAIL_PATHS } from "./geography";
import type { Category, Coordinate, ServiceCall, TrainService } from "./types";

const getPath = (pathId: string): Coordinate[] => {
	const p = RAIL_PATHS.find((r) => r.id === pathId);
	return p ? p.coordinates : [];
};

const getReversePath = (pathId: string): Coordinate[] => {
	return [...getPath(pathId)].reverse();
};

export const generateSchedule = (): TrainService[] => {
	const services: TrainService[] = [];
	let idCounter = 1;

	const add = (
		serviceNumber: string,
		name: string,
		category: Category,
		operator: string,
		rollingStock: string,
		pathCoordinates: Coordinate[],
		calls: ServiceCall[],
	) => {
		services.push({
			id: `SR-${idCounter++}`,
			serviceNumber,
			name,
			category,
			operator,
			rollingStock,
			pathCoordinates,
			calls,
		});
	};

	// 1. Central Belt Express: Edinburgh Waverley <-> Glasgow Queen Street
	// Runs every 15-30 min between 06:00 (360) and 23:45 (1425)
	for (let t = 360; t <= 1410; t += 20) {
		const falkirkTime = t + 24;
		const arrTime = t + 48;
		// East to West (EDB -> GLQ)
		add(
			`1R${Math.floor(t / 10)}`,
			"Edinburgh -> Glasgow Queen St",
			"Express",
			"ScotRail Express",
			"Class 385 eXpress (EMU)",
			getPath("edb-glq-falkirk"),
			[
				{ stationId: "EDB", arrivalOffset: null, departureOffset: t },
				{ stationId: "HYM", arrivalOffset: t + 4, departureOffset: t + 5 },
				{ stationId: "LIN", arrivalOffset: t + 18, departureOffset: t + 19 },
				{
					stationId: "FKK",
					arrivalOffset: falkirkTime,
					departureOffset: falkirkTime + 1,
				},
				{ stationId: "GLQ", arrivalOffset: arrTime, departureOffset: null },
			],
		);

		// West to East (GLQ -> EDB)
		add(
			`1E${Math.floor(t / 10)}`,
			"Glasgow Queen St -> Edinburgh",
			"Express",
			"ScotRail Express",
			"Class 385 eXpress (EMU)",
			getReversePath("edb-glq-falkirk"),
			[
				{ stationId: "GLQ", arrivalOffset: null, departureOffset: t + 5 },
				{ stationId: "FKK", arrivalOffset: t + 28, departureOffset: t + 29 },
				{ stationId: "LIN", arrivalOffset: t + 37, departureOffset: t + 38 },
				{ stationId: "HYM", arrivalOffset: t + 48, departureOffset: t + 49 },
				{ stationId: "EDB", arrivalOffset: arrTime + 5, departureOffset: null },
			],
		);
	}

	// 2. Highland Main Line: Edinburgh/Glasgow -> Perth -> Inverness
	// Runs every ~60-90 min
	for (let t = 380; t <= 1260; t += 75) {
		const perthTime = t + 65;
		const pitTime = perthTime + 32;
		const avmTime = pitTime + 45;
		const invTime = avmTime + 40;

		const highlandPath = [
			...getPath("falkirk-stirling-perth"),
			...getPath("perth-inverness"),
		];

		// Northbound
		add(
			`1H${Math.floor(t / 15)}`,
			"Edinburgh/Glasgow -> Inverness",
			"Highland",
			"ScotRail Inter7City",
			"Class 43 High Speed Train (HST)",
			highlandPath,
			[
				{ stationId: "EDB", arrivalOffset: null, departureOffset: t },
				{ stationId: "STG", arrivalOffset: t + 40, departureOffset: t + 42 },
				{ stationId: "DUN", arrivalOffset: t + 49, departureOffset: t + 50 },
				{
					stationId: "PTH",
					arrivalOffset: perthTime,
					departureOffset: perthTime + 5,
				},
				{
					stationId: "PIT",
					arrivalOffset: pitTime,
					departureOffset: pitTime + 2,
				},
				{
					stationId: "AVM",
					arrivalOffset: avmTime,
					departureOffset: avmTime + 3,
				},
				{ stationId: "INV", arrivalOffset: invTime, departureOffset: null },
			],
		);

		// Southbound
		add(
			`1S${Math.floor(t / 15)}`,
			"Inverness -> Edinburgh",
			"Highland",
			"ScotRail Inter7City",
			"Class 43 High Speed Train (HST)",
			[...highlandPath].reverse(),
			[
				{ stationId: "INV", arrivalOffset: null, departureOffset: t + 15 },
				{ stationId: "AVM", arrivalOffset: t + 55, departureOffset: t + 57 },
				{ stationId: "PIT", arrivalOffset: t + 98, departureOffset: t + 100 },
				{ stationId: "PTH", arrivalOffset: t + 132, departureOffset: t + 136 },
				{ stationId: "STG", arrivalOffset: t + 172, departureOffset: t + 174 },
				{ stationId: "EDB", arrivalOffset: t + 215, departureOffset: null },
			],
		);
	}

	// 3. East Coast Line: Edinburgh -> Dundee -> Aberdeen
	for (let t = 390; t <= 1320; t += 45) {
		const ecPath = getPath("edb-dundee-aberdeen");
		add(
			`1A${Math.floor(t / 10)}`,
			"Edinburgh -> Aberdeen",
			"Express",
			"ScotRail / LNER",
			"Class 800 Azuma (Bi-mode)",
			ecPath,
			[
				{ stationId: "EDB", arrivalOffset: null, departureOffset: t },
				{ stationId: "HYM", arrivalOffset: t + 4, departureOffset: t + 5 },
				{ stationId: "LEU", arrivalOffset: t + 48, departureOffset: t + 50 },
				{ stationId: "DEE", arrivalOffset: t + 65, departureOffset: t + 70 },
				{ stationId: "ARB", arrivalOffset: t + 85, departureOffset: t + 86 },
				{ stationId: "MTS", arrivalOffset: t + 102, departureOffset: t + 104 },
				{ stationId: "STN", arrivalOffset: t + 125, departureOffset: t + 126 },
				{ stationId: "ABZ", arrivalOffset: t + 142, departureOffset: null },
			],
		);

		add(
			`1B${Math.floor(t / 10)}`,
			"Aberdeen -> Edinburgh",
			"Express",
			"ScotRail / LNER",
			"Class 800 Azuma (Bi-mode)",
			getReversePath("edb-dundee-aberdeen"),
			[
				{ stationId: "ABZ", arrivalOffset: null, departureOffset: t + 10 },
				{ stationId: "STN", arrivalOffset: t + 26, departureOffset: t + 27 },
				{ stationId: "MTS", arrivalOffset: t + 48, departureOffset: t + 50 },
				{ stationId: "ARB", arrivalOffset: t + 66, departureOffset: t + 67 },
				{ stationId: "DEE", arrivalOffset: t + 82, departureOffset: t + 87 },
				{ stationId: "LEU", arrivalOffset: t + 102, departureOffset: t + 104 },
				{ stationId: "EDB", arrivalOffset: t + 152, departureOffset: null },
			],
		);
	}

	// 4. West Highland Line: Glasgow Queen St -> Fort William -> Mallaig & Oban
	const westHighlandDepartures = [370, 520, 730, 980, 1140];
	for (const t of westHighlandDepartures) {
		add(
			`1Y${Math.floor(t / 10)}`,
			"The Jacobite / West Highland Line",
			"Highland",
			"ScotRail Scenic",
			"Class 156 Super Sprinter",
			getPath("glasgow-westhighland-mallaig"),
			[
				{ stationId: "GLQ", arrivalOffset: null, departureOffset: t },
				{ stationId: "DBR", arrivalOffset: t + 22, departureOffset: t + 23 },
				{ stationId: "HEL", arrivalOffset: t + 42, departureOffset: t + 43 },
				{ stationId: "CRI", arrivalOffset: t + 85, departureOffset: t + 90 },
				{ stationId: "TYN", arrivalOffset: t + 102, departureOffset: t + 103 },
				{ stationId: "FTW", arrivalOffset: t + 185, departureOffset: t + 195 },
				{ stationId: "GLF", arrivalOffset: t + 225, departureOffset: t + 227 },
				{ stationId: "MLG", arrivalOffset: t + 270, departureOffset: null },
			],
		);

		add(
			`1Z${Math.floor(t / 10)}`,
			"West Highland Line (Glasgow)",
			"Highland",
			"ScotRail Scenic",
			"Class 156 Super Sprinter",
			getReversePath("glasgow-westhighland-mallaig"),
			[
				{ stationId: "MLG", arrivalOffset: null, departureOffset: t + 30 },
				{ stationId: "GLF", arrivalOffset: t + 72, departureOffset: t + 74 },
				{ stationId: "FTW", arrivalOffset: t + 105, departureOffset: t + 115 },
				{ stationId: "TYN", arrivalOffset: t + 196, departureOffset: t + 197 },
				{ stationId: "CRI", arrivalOffset: t + 210, departureOffset: t + 215 },
				{ stationId: "HEL", arrivalOffset: t + 258, departureOffset: t + 259 },
				{ stationId: "GLQ", arrivalOffset: t + 300, departureOffset: null },
			],
		);
	}

	// 5. Far North & Kyle of Lochalsh
	const farNorthDepartures = [410, 640, 890, 1100];
	for (const t of farNorthDepartures) {
		add(
			`2K${Math.floor(t / 10)}`,
			"Kyle Line (Inverness -> Kyle of Lochalsh)",
			"Highland",
			"ScotRail Highland",
			"Class 158 Express Sprinter",
			getPath("inverness-farnorth-kyle"),
			[
				{ stationId: "INV", arrivalOffset: null, departureOffset: t },
				{ stationId: "DING", arrivalOffset: t + 32, departureOffset: t + 34 },
				{ stationId: "KYL", arrivalOffset: t + 155, departureOffset: null },
			],
		);

		add(
			`2N${Math.floor(t / 10)}`,
			"Far North Line (Inverness -> Wick & Thurso)",
			"Highland",
			"ScotRail Highland",
			"Class 158 Express Sprinter",
			[
				...getPath("inverness-farnorth-kyle").slice(0, 2),
				...getPath("dingwall-wick-thurso"),
			],
			[
				{ stationId: "INV", arrivalOffset: null, departureOffset: t + 15 },
				{ stationId: "DING", arrivalOffset: t + 47, departureOffset: t + 49 },
				{ stationId: "THS", arrivalOffset: t + 210, departureOffset: t + 215 },
				{ stationId: "WCK", arrivalOffset: t + 245, departureOffset: null },
			],
		);
	}

	// 6. Cross-Border & InterCity: LNER Azuma, Avanti West Coast & CrossCountry
	for (let t = 420; t <= 1260; t += 60) {
		// LNER King's Cross <-> Edinburgh Waverley
		add(
			`1S${Math.floor(t / 12)}`,
			"LNER Azuma (London King's Cross -> Edinburgh)",
			"CrossBorder",
			"LNER (London North Eastern Railway)",
			"Class 801 Azuma (Electric 9-car)",
			getReversePath("edinburgh-berwick-ecml"),
			[
				{ stationId: "BWK", arrivalOffset: null, departureOffset: t },
				{ stationId: "DUNB", arrivalOffset: t + 22, departureOffset: t + 23 },
				{ stationId: "EDB", arrivalOffset: t + 45, departureOffset: null },
			],
		);

		add(
			`1E${Math.floor(t / 12)}`,
			"LNER Azuma (Edinburgh -> London King's Cross)",
			"CrossBorder",
			"LNER (London North Eastern Railway)",
			"Class 801 Azuma (Electric 9-car)",
			getPath("edinburgh-berwick-ecml"),
			[
				{ stationId: "EDB", arrivalOffset: null, departureOffset: t + 15 },
				{ stationId: "DUNB", arrivalOffset: t + 37, departureOffset: t + 38 },
				{ stationId: "BWK", arrivalOffset: t + 60, departureOffset: null },
			],
		);

		// Avanti West Coast: London Euston <-> Glasgow Central
		add(
			`1M${Math.floor(t / 12)}`,
			"Avanti West Coast (London Euston -> Glasgow Central)",
			"CrossBorder",
			"Avanti West Coast",
			"Class 390 Pendolino (Tilting Train)",
			getReversePath("glasgow-carlisle-wcml"),
			[
				{ stationId: "CAR", arrivalOffset: null, departureOffset: t + 10 },
				{ stationId: "LOCK", arrivalOffset: t + 32, departureOffset: t + 33 },
				{ stationId: "MTH", arrivalOffset: t + 62, departureOffset: t + 64 },
				{ stationId: "GLC", arrivalOffset: t + 78, departureOffset: null },
			],
		);

		add(
			`1S${Math.floor(t / 12) + 50}`,
			"Avanti West Coast (Glasgow Central -> London Euston)",
			"CrossBorder",
			"Avanti West Coast",
			"Class 390 Pendolino (Tilting Train)",
			getPath("glasgow-carlisle-wcml"),
			[
				{ stationId: "GLC", arrivalOffset: null, departureOffset: t + 25 },
				{ stationId: "MTH", arrivalOffset: t + 39, departureOffset: t + 41 },
				{ stationId: "LOCK", arrivalOffset: t + 70, departureOffset: t + 71 },
				{ stationId: "CAR", arrivalOffset: t + 95, departureOffset: null },
			],
		);
	}

	// Iconic LNER "Highland Chieftain" (London King's Cross <-> Inverness direct via ECML & Highland Mainline)
	const lnerHighlandPathNorth = [
		...getReversePath("edinburgh-berwick-ecml"),
		...getPath("falkirk-stirling-perth"),
		...getPath("perth-inverness"),
	];
	add(
		`1H05`,
		"LNER 'Highland Chieftain' (London King's Cross -> Inverness)",
		"CrossBorder",
		"LNER (London North Eastern Railway)",
		"Class 800 Azuma (Bi-mode 9-car)",
		lnerHighlandPathNorth,
		[
			{ stationId: "BWK", arrivalOffset: null, departureOffset: 720 }, // 12:00
			{ stationId: "EDB", arrivalOffset: 765, departureOffset: 775 }, // 12:55
			{ stationId: "STG", arrivalOffset: 815, departureOffset: 818 },
			{ stationId: "PTH", arrivalOffset: 860, departureOffset: 865 },
			{ stationId: "PIT", arrivalOffset: 895, departureOffset: 897 },
			{ stationId: "AVM", arrivalOffset: 940, departureOffset: 943 },
			{ stationId: "INV", arrivalOffset: 985, departureOffset: null }, // 16:25
		],
	);

	add(
		`1E15`,
		"LNER 'Highland Chieftain' (Inverness -> London King's Cross)",
		"CrossBorder",
		"LNER (London North Eastern Railway)",
		"Class 800 Azuma (Bi-mode 9-car)",
		[...lnerHighlandPathNorth].reverse(),
		[
			{ stationId: "INV", arrivalOffset: null, departureOffset: 470 }, // 07:50
			{ stationId: "AVM", arrivalOffset: 512, departureOffset: 515 },
			{ stationId: "PIT", arrivalOffset: 558, departureOffset: 560 },
			{ stationId: "PTH", arrivalOffset: 590, departureOffset: 595 },
			{ stationId: "STG", arrivalOffset: 635, departureOffset: 638 },
			{ stationId: "EDB", arrivalOffset: 678, departureOffset: 690 }, // 11:30
			{ stationId: "BWK", arrivalOffset: 735, departureOffset: null },
		],
	);

	// LNER "Flying Scotsman" / Aberdeen Direct (London <-> Aberdeen via Forth & Tay Bridges)
	const lnerAberdeenPathNorth = [
		...getReversePath("edinburgh-berwick-ecml"),
		...getPath("edb-dundee-aberdeen"),
	];
	add(
		`1A25`,
		"LNER 'Northern Lights' (London King's Cross -> Aberdeen)",
		"CrossBorder",
		"LNER (London North Eastern Railway)",
		"Class 800 Azuma (Bi-mode 9-car)",
		lnerAberdeenPathNorth,
		[
			{ stationId: "BWK", arrivalOffset: null, departureOffset: 660 }, // 11:00
			{ stationId: "EDB", arrivalOffset: 705, departureOffset: 715 }, // 11:55
			{ stationId: "LEU", arrivalOffset: 760, departureOffset: 762 },
			{ stationId: "DEE", arrivalOffset: 778, departureOffset: 783 },
			{ stationId: "ARB", arrivalOffset: 800, departureOffset: 802 },
			{ stationId: "MTS", arrivalOffset: 818, departureOffset: 820 },
			{ stationId: "STN", arrivalOffset: 840, departureOffset: 842 },
			{ stationId: "ABZ", arrivalOffset: 860, departureOffset: null }, // 14:20
		],
	);

	// CrossCountry Voyager (Penzance/Birmingham -> Edinburgh -> Glasgow/Aberdeen)
	add(
		`1V50`,
		"CrossCountry (Plymouth -> Edinburgh Waverley)",
		"CrossBorder",
		"CrossCountry",
		"Class 220 / 221 Voyager (DEMU)",
		getReversePath("edinburgh-berwick-ecml"),
		[
			{ stationId: "BWK", arrivalOffset: null, departureOffset: 880 }, // 14:40
			{ stationId: "DUNB", arrivalOffset: 902, departureOffset: 904 },
			{ stationId: "EDB", arrivalOffset: 928, departureOffset: null },
		],
	);

	// 7. Caledonian Sleeper (Overnight)
	// Arrives early morning in Scotland (05:00 - 08:30), departs late evening (20:30 - 23:30)
	add(
		`1S25`,
		"Caledonian Sleeper (London -> Inverness)",
		"Sleeper",
		"Caledonian Sleeper",
		"Class 92 / Mark 5 Coaching Stock",
		[
			...getPath("edinburgh-berwick-ecml").slice(0, 1),
			...getPath("falkirk-stirling-perth"),
			...getPath("perth-inverness"),
		],
		[
			{ stationId: "EDB", arrivalOffset: 290, departureOffset: 310 }, // 04:50 - 05:10
			{ stationId: "STG", arrivalOffset: 350, departureOffset: 355 },
			{ stationId: "PTH", arrivalOffset: 410, departureOffset: 420 },
			{ stationId: "AVM", arrivalOffset: 490, departureOffset: 495 },
			{ stationId: "INV", arrivalOffset: 535, departureOffset: null }, // 08:55
		],
	);

	add(
		`1S26`,
		"Caledonian Sleeper (London -> Fort William)",
		"Sleeper",
		"Caledonian Sleeper",
		"Class 73/9 / Mark 5 Coaching Stock",
		getPath("glasgow-westhighland-mallaig").slice(0, -3),
		[
			{ stationId: "GLQ", arrivalOffset: 320, departureOffset: 340 },
			{ stationId: "CRI", arrivalOffset: 420, departureOffset: 430 },
			{ stationId: "FTW", arrivalOffset: 520, departureOffset: null }, // 08:40
		],
	);

	add(
		`1M16`,
		"Caledonian Sleeper (Inverness -> London)",
		"Sleeper",
		"Caledonian Sleeper",
		"Class 92 / Mark 5 Coaching Stock",
		[
			...getReversePath("perth-inverness"),
			...getReversePath("falkirk-stirling-perth"),
		],
		[
			{ stationId: "INV", arrivalOffset: null, departureOffset: 1230 }, // 20:30
			{ stationId: "AVM", arrivalOffset: 1270, departureOffset: 1275 },
			{ stationId: "PTH", arrivalOffset: 1345, departureOffset: 1355 },
			{ stationId: "STG", arrivalOffset: 1410, departureOffset: 1415 },
			{ stationId: "EDB", arrivalOffset: 1455, departureOffset: 1475 },
		],
	);

	// 8. Suburban & Regional: Ayrshire / Stranraer & Borders Railway
	for (let t = 380; t <= 1380; t += 30) {
		add(
			`2G${Math.floor(t / 10)}`,
			"Glasgow Central -> Ayr",
			"Commuter",
			"ScotRail Suburban",
			"Class 380 Desiro (EMU)",
			getPath("glasgow-ayr-stranraer").slice(0, 4),
			[
				{ stationId: "GLC", arrivalOffset: null, departureOffset: t },
				{ stationId: "PYG", arrivalOffset: t + 12, departureOffset: t + 13 },
				{ stationId: "AYR", arrivalOffset: t + 50, departureOffset: null },
			],
		);

		add(
			`2B${Math.floor(t / 10)}`,
			"Edinburgh -> Tweedbank (Borders)",
			"Commuter",
			"ScotRail Borders",
			"Class 170 Turbostar (DMU)",
			getPath("edinburgh-tweedbank"),
			[
				{ stationId: "EDB", arrivalOffset: null, departureOffset: t + 10 },
				{ stationId: "TWD", arrivalOffset: t + 55, departureOffset: null },
			],
		);
	}

	return services;
};
