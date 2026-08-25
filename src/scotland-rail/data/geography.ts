import type { Coordinate, Landmark, Loch, RailPath, Station } from "./types";

export const STATIONS: Station[] = [
	// Central Belt Hubs & Key Commuter Stops
	{
		id: "EDB",
		name: "Edinburgh Waverley",
		coordinate: [-3.189, 55.952],
		isMajor: true,
	},
	{ id: "HYM", name: "Haymarket", coordinate: [-3.218, 55.945] },
	{
		id: "GLC",
		name: "Glasgow Central",
		coordinate: [-4.258, 55.859],
		isMajor: true,
	},
	{
		id: "GLQ",
		name: "Glasgow Queen Street",
		coordinate: [-4.251, 55.862],
		isMajor: true,
	},
	{ id: "FKK", name: "Falkirk High", coordinate: [-3.784, 55.992] },
	{ id: "FKG", name: "Falkirk Grahamston", coordinate: [-3.781, 56.004] },
	{ id: "LIN", name: "Linlithgow", coordinate: [-3.601, 55.977] },
	{ id: "PLY", name: "Polmont", coordinate: [-3.712, 55.992] },
	{ id: "STG", name: "Stirling", coordinate: [-3.935, 56.12], isMajor: true },
	{ id: "DUN", name: "Dunblane", coordinate: [-3.963, 56.189] },
	{ id: "GLD", name: "Gleneagles", coordinate: [-3.748, 56.286] },
	{ id: "MBK", name: "Milngavie", coordinate: [-4.316, 55.942] },
	{ id: "HEL", name: "Helensburgh Central", coordinate: [-4.737, 56.004] },
	{ id: "DBR", name: "Dumbarton Central", coordinate: [-4.568, 55.946] },
	{ id: "PYG", name: "Paisley Gilmour Street", coordinate: [-4.427, 55.847] },
	{ id: "AYR", name: "Ayr", coordinate: [-4.624, 55.459], isMajor: true },
	{ id: "TRO", name: "Troon", coordinate: [-4.654, 55.545] },
	{ id: "KLM", name: "Kilmarnock", coordinate: [-4.498, 55.612] },
	{ id: "KCK", name: "Kirkcaldy", coordinate: [-3.161, 56.112] },
	{ id: "MTH", name: "Motherwell", coordinate: [-3.991, 55.791] },

	// East Coast & North East
	{ id: "DEE", name: "Dundee", coordinate: [-2.973, 56.457], isMajor: true },
	{ id: "LEU", name: "Leuchars (St Andrews)", coordinate: [-2.883, 56.38] },
	{ id: "ABZ", name: "Aberdeen", coordinate: [-2.098, 57.143], isMajor: true },
	{ id: "STN", name: "Stonehaven", coordinate: [-2.221, 56.963] },
	{ id: "MTS", name: "Montrose", coordinate: [-2.472, 56.711] },
	{ id: "ARB", name: "Arbroath", coordinate: [-2.585, 56.559] },
	{ id: "DYC", name: "Dyce (Aberdeen Airport)", coordinate: [-2.203, 57.204] },
	{ id: "INR", name: "Inverurie", coordinate: [-2.373, 57.283] },

	// Highlands & Perthshire
	{ id: "PTH", name: "Perth", coordinate: [-3.437, 56.391], isMajor: true },
	{ id: "DKD", name: "Dunkeld & Birnam", coordinate: [-3.582, 56.559] },
	{ id: "PIT", name: "Pitlochry", coordinate: [-3.737, 56.702] },
	{ id: "BLA", name: "Blair Atholl", coordinate: [-3.847, 56.766] },
	{ id: "DAL", name: "Dalwhinnie", coordinate: [-4.241, 56.938] },
	{ id: "NGU", name: "Newtonmore", coordinate: [-4.12, 57.065] },
	{ id: "KGS", name: "Kingussie", coordinate: [-4.053, 57.079] },
	{ id: "AVM", name: "Aviemore", coordinate: [-3.83, 57.189], isMajor: true },
	{ id: "CRB", name: "Carrbridge", coordinate: [-3.818, 57.282] },
	{ id: "INV", name: "Inverness", coordinate: [-4.223, 57.479], isMajor: true },
	{ id: "NAI", name: "Nairn", coordinate: [-3.874, 57.581] },
	{ id: "FOR", name: "Forres", coordinate: [-3.626, 57.609] },
	{ id: "ELG", name: "Elgin", coordinate: [-3.313, 57.643] },
	{ id: "KEI", name: "Keith", coordinate: [-2.946, 57.538] },

	// West Highland Line (Glenfinnan Viaduct & Scenic Route)
	{ id: "ARO", name: "Arrochar & Tarbet", coordinate: [-4.717, 56.2] },
	{
		id: "CRI",
		name: "Crianlarich",
		coordinate: [-4.618, 56.393],
		isMajor: true,
	},
	{ id: "TYU", name: "Upper Tyndrum", coordinate: [-4.707, 56.438] },
	{ id: "TYN", name: "Tyndrum Lower", coordinate: [-4.71, 56.435] },
	{ id: "DALM", name: "Dalmally", coordinate: [-5.006, 56.4] },
	{ id: "TAY", name: "Taynuilt", coordinate: [-5.241, 56.434] },
	{ id: "CON", name: "Connel Ferry", coordinate: [-5.394, 56.452] },
	{ id: "OBA", name: "Oban", coordinate: [-5.474, 56.412], isMajor: true },
	{ id: "BOC", name: "Bridge of Orchy", coordinate: [-4.673, 56.516] },
	{ id: "RRM", name: "Rannoch", coordinate: [-4.577, 56.685] },
	{ id: "CRU", name: "Corrour (Remote)", coordinate: [-4.69, 56.76] },
	{ id: "SPE", name: "Spean Bridge", coordinate: [-4.919, 56.892] },
	{
		id: "FTW",
		name: "Fort William",
		coordinate: [-5.105, 56.822],
		isMajor: true,
	},
	{ id: "CPH", name: "Corpach", coordinate: [-5.127, 56.844] },
	{
		id: "GLF",
		name: "Glenfinnan Viaduct",
		coordinate: [-5.437, 56.87],
		isMajor: true,
	},
	{ id: "LOA", name: "Lochailort", coordinate: [-5.669, 56.876] },
	{ id: "ARA", name: "Arisaig", coordinate: [-5.845, 56.908] },
	{ id: "MOR", name: "Morar", coordinate: [-5.821, 56.971] },
	{ id: "MLG", name: "Mallaig", coordinate: [-5.828, 57.006], isMajor: true },

	// Far North & Kyle of Lochalsh
	{ id: "MUI", name: "Muir of Ord", coordinate: [-4.457, 57.518] },
	{ id: "DING", name: "Dingwall", coordinate: [-4.426, 57.597], isMajor: true },
	{ id: "GAR", name: "Garve", coordinate: [-4.693, 57.61] },
	{ id: "ACH", name: "Achnasheen", coordinate: [-5.074, 57.579] },
	{ id: "PLK", name: "Plockton", coordinate: [-5.65, 57.336] },
	{
		id: "KYL",
		name: "Kyle of Lochalsh",
		coordinate: [-5.714, 57.279],
		isMajor: true,
	},
	{ id: "INVG", name: "Invergordon", coordinate: [-4.172, 57.69] },
	{ id: "TAIN", name: "Tain", coordinate: [-4.053, 57.813] },
	{ id: "LAR", name: "Lairg", coordinate: [-4.398, 58.026] },
	{ id: "GOL", name: "Golspie", coordinate: [-3.978, 57.973] },
	{ id: "HELMS", name: "Helmsdale", coordinate: [-3.649, 58.12] },
	{ id: "WCK", name: "Wick", coordinate: [-3.094, 58.442], isMajor: true },
	{ id: "THS", name: "Thurso", coordinate: [-3.527, 58.592], isMajor: true },

	// South & Cross Border Entry Points
	{ id: "DUNB", name: "Dunbar", coordinate: [-2.514, 55.998] },
	{
		id: "BWK",
		name: "Berwick-upon-Tweed",
		coordinate: [-2.012, 55.774],
		isMajor: true,
	},
	{ id: "TWD", name: "Tweedbank", coordinate: [-2.756, 55.602] },
	{ id: "GLX", name: "Galashiels", coordinate: [-2.772, 55.617] },
	{ id: "CAR", name: "Carlisle", coordinate: [-2.933, 54.89], isMajor: true },
	{ id: "LOCK", name: "Lockerbie", coordinate: [-3.355, 55.123] },
	{ id: "DUM", name: "Dumfries", coordinate: [-3.606, 55.074] },
	{ id: "STR", name: "Stranraer", coordinate: [-5.027, 54.906] },
];

export const STATIONS_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

// Major Scottish Lochs (Polygons for vector map rendering)
export const LOCHS: Loch[] = [
	{
		id: "loch-ness",
		name: "Loch Ness",
		coordinates: [
			[-4.32, 57.34],
			[-4.38, 57.29],
			[-4.46, 57.23],
			[-4.58, 57.17],
			[-4.69, 57.13],
			[-4.73, 57.14],
			[-4.62, 57.19],
			[-4.51, 57.25],
			[-4.41, 57.31],
			[-4.32, 57.34],
		] as Coordinate[],
	},
	{
		id: "loch-lomond",
		name: "Loch Lomond",
		coordinates: [
			[-4.62, 56.19],
			[-4.68, 56.12],
			[-4.64, 56.06],
			[-4.59, 56.02],
			[-4.55, 56.05],
			[-4.58, 56.11],
			[-4.62, 56.19],
		] as Coordinate[],
	},
	{
		id: "loch-tay",
		name: "Loch Tay",
		coordinates: [
			[-4.26, 56.48],
			[-4.18, 56.51],
			[-4.08, 56.55],
			[-4.02, 56.57],
			[-4.07, 56.56],
			[-4.16, 56.52],
			[-4.26, 56.48],
		] as Coordinate[],
	},
	{
		id: "loch-morar",
		name: "Loch Morar",
		coordinates: [
			[-5.81, 56.97],
			[-5.73, 56.97],
			[-5.62, 56.96],
			[-5.58, 56.97],
			[-5.65, 56.98],
			[-5.75, 56.98],
			[-5.81, 56.97],
		] as Coordinate[],
	},
];

// Iconic Scottish Rail Landmarks & Viaducts
export const LANDMARKS: Landmark[] = [
	{
		id: "glenfinnan-viaduct",
		name: "Glenfinnan Viaduct",
		coordinate: [-5.431, 56.876] as Coordinate,
		icon: "🚂",
		description:
			"21-arch concrete viaduct made famous by the Jacobite / Hogwarts Express",
	},
	{
		id: "forth-bridge",
		name: "Forth Rail Bridge",
		coordinate: [-3.395, 55.994] as Coordinate,
		icon: "🌉",
		description:
			"UNESCO World Heritage cantilever railway bridge opened in 1890",
	},
	{
		id: "tay-bridge",
		name: "Tay Rail Bridge",
		coordinate: [-2.938, 56.445] as Coordinate,
		icon: "🌊",
		description: "2.75-mile tidal crossing into Dundee",
	},
	{
		id: "drumochter-summit",
		name: "Drumochter Pass Summit",
		coordinate: [-4.162, 56.885] as Coordinate,
		icon: "🏔️",
		description: "Highest railway summit in Great Britain (1,484 ft / 452 m)",
	},
	{
		id: "culloden-viaduct",
		name: "Culloden Viaduct",
		coordinate: [-4.155, 57.452] as Coordinate,
		icon: "🏛️",
		description:
			"Scotland's longest masonry viaduct (29 arches across the Nairn valley)",
	},
];

// High-fidelity rail polylines tracing actual Scottish track geometry
export const RAIL_PATHS: RailPath[] = [
	// 1. Central Belt Line: Edinburgh Waverley <-> Glasgow Queen Street (via Falkirk High)
	{
		id: "edb-glq-falkirk",
		name: "Central Belt Mainline",
		coordinates: [
			[-3.189, 55.952], // EDB
			[-3.218, 55.945], // HYM
			[-3.344, 55.937],
			[-3.486, 55.949],
			[-3.601, 55.977], // LIN
			[-3.712, 55.992], // PLY
			[-3.784, 55.992], // FKK
			[-3.91, 55.968],
			[-4.032, 55.945], // Croy
			[-4.154, 55.908], // Lenzie
			[-4.221, 55.875],
			[-4.251, 55.862], // GLQ
		],
	},

	// 2. Edinburgh/Glasgow to Stirling, Dunblane, Gleneagles & Perth
	{
		id: "falkirk-stirling-perth",
		name: "Stirling & Perth Branch",
		coordinates: [
			[-3.784, 55.992], // FKK
			[-3.805, 56.02], // Larbert
			[-3.872, 56.075],
			[-3.935, 56.12], // STG
			[-3.955, 56.155], // Bridge of Allan
			[-3.963, 56.189], // DUN
			[-3.882, 56.241],
			[-3.748, 56.286], // Gleneagles
			[-3.61, 56.33],
			[-3.48, 56.365],
			[-3.437, 56.391], // PTH
		],
	},

	// 3. Highland Main Line: Perth -> Pitlochry -> Blair Atholl -> Aviemore -> Inverness
	{
		id: "perth-inverness",
		name: "Highland Main Line",
		coordinates: [
			[-3.437, 56.391], // PTH
			[-3.475, 56.468], // Luncarty
			[-3.535, 56.53],
			[-3.582, 56.559], // Dunkeld
			[-3.665, 56.635], // Ballinluig
			[-3.737, 56.702], // PIT
			[-3.78, 56.735], // Pass of Killiecrankie
			[-3.847, 56.766], // BLA
			[-4.02, 56.845], // Struan
			[-4.162, 56.885], // Drumochter Pass (Highest summit)
			[-4.241, 56.938], // Dalwhinnie
			[-4.12, 57.065], // Newtonmore
			[-4.053, 57.079], // Kingussie
			[-3.92, 57.135], // Kincraig
			[-3.83, 57.189], // AVM
			[-3.818, 57.282], // Carrbridge
			[-3.93, 57.355], // Slochd Summit
			[-4.05, 57.41], // Moy
			[-4.155, 57.452], // Culloden Viaduct
			[-4.223, 57.479], // INV
		],
	},

	// 4. East Coast Main Line: Edinburgh -> Forth Bridge -> Dundee -> Tay Bridge -> Aberdeen
	{
		id: "edb-dundee-aberdeen",
		name: "East Coast Line",
		coordinates: [
			[-3.189, 55.952], // EDB
			[-3.218, 55.945], // HYM
			[-3.342, 55.968], // Edinburgh Gateway
			[-3.388, 55.986], // Forth Bridge (South)
			[-3.402, 56.002], // Forth Bridge (North)
			[-3.398, 56.035], // Inverkeithing
			[-3.285, 56.065], // Aberdour
			[-3.228, 56.07], // Burntisland
			[-3.161, 56.112], // Kirkcaldy
			[-3.03, 56.195], // Markinch
			[-2.955, 56.31], // Cupar
			[-2.883, 56.38], // LEU (Leuchars)
			[-2.925, 56.438], // Tay Rail Bridge (South)
			[-2.952, 56.452], // Tay Rail Bridge (North)
			[-2.973, 56.457], // DEE
			[-2.83, 56.475], // Broughty Ferry
			[-2.715, 56.505], // Carnoustie
			[-2.585, 56.559], // ARB (Arbroath)
			[-2.472, 56.711], // MTS (Montrose)
			[-2.32, 56.84], // Laurencekirk
			[-2.221, 56.963], // STN (Stonehaven)
			[-2.14, 57.065], // Portlethen
			[-2.098, 57.143], // ABZ
		],
	},

	// 5. Aberdeen to Inverness Line (via Elgin, Keith, Forres, Nairn)
	{
		id: "aberdeen-inverness",
		name: "Aberdeen - Inverness Line",
		coordinates: [
			[-2.098, 57.143], // ABZ
			[-2.203, 57.204], // Dyce
			[-2.373, 57.283], // Inverurie
			[-2.55, 57.35], // Insch
			[-2.78, 57.44], // Huntly
			[-2.946, 57.538], // Keith
			[-3.313, 57.643], // ELG (Elgin)
			[-3.626, 57.609], // Forres
			[-3.874, 57.581], // Nairn
			[-4.06, 57.53], // Inverness Airport
			[-4.223, 57.479], // INV
		],
	},

	// 6. West Highland Line: Glasgow -> Helensburgh -> Crianlarich -> Rannoch Moor -> Fort William -> Glenfinnan -> Mallaig
	{
		id: "glasgow-westhighland-mallaig",
		name: "West Highland Line",
		coordinates: [
			[-4.251, 55.862], // GLQ
			[-4.34, 55.895], // Westerton
			[-4.455, 55.918], // Bowling
			[-4.568, 55.946], // DBR (Dumbarton)
			[-4.737, 56.004], // HEL (Helensburgh)
			[-4.76, 56.08], // Garelochhead
			[-4.717, 56.2], // Arrochar & Tarbet (Loch Lomond)
			[-4.695, 56.315], // Ardlui
			[-4.618, 56.393], // CRI (Crianlarich Junction)
			[-4.707, 56.438], // Upper Tyndrum
			[-4.673, 56.516], // Bridge of Orchy
			[-4.62, 56.61], // Rannoch Station (Loch Laidon)
			[-4.577, 56.685], // RRM
			[-4.69, 56.76], // Corrour (Loch Ossian)
			[-4.84, 56.84], // Tulloch (Glen Spean)
			[-4.919, 56.892], // Spean Bridge
			[-5.105, 56.822], // FTW (Fort William)
			[-5.127, 56.844], // Corpach
			[-5.28, 56.86], // Locheilside
			[-5.437, 56.87], // Glenfinnan Viaduct
			[-5.669, 56.876], // Lochailort
			[-5.77, 56.89], // Beasdale
			[-5.845, 56.908], // Arisaig
			[-5.821, 56.971], // Morar
			[-5.828, 57.006], // MLG (Mallaig)
		],
	},

	// 7. Oban Branch (diverging at Crianlarich)
	{
		id: "crianlarich-oban",
		name: "Oban Branch",
		coordinates: [
			[-4.618, 56.393], // CRI
			[-4.71, 56.435], // Tyndrum Lower
			[-5.006, 56.4], // Dalmally
			[-5.15, 56.415], // Falls of Cruachan
			[-5.241, 56.434], // Taynuilt
			[-5.394, 56.452], // Connel Ferry
			[-5.474, 56.412], // OBA (Oban)
		],
	},

	// 8. Kyle of Lochalsh Line (Inverness -> Dingwall -> Achnasheen -> Kyle)
	{
		id: "inverness-farnorth-kyle",
		name: "Kyle Line",
		coordinates: [
			[-4.223, 57.479], // INV
			[-4.457, 57.518], // Muir of Ord
			[-4.426, 57.597], // DING (Dingwall)
			[-4.693, 57.61], // Garve
			[-5.074, 57.579], // Achnasheen
			[-5.34, 57.49], // Achnashellach
			[-5.45, 57.44], // Strathcarron
			[-5.55, 57.37], // Attadale
			[-5.62, 57.34], // Stromeferry
			[-5.65, 57.336], // Plockton
			[-5.714, 57.279], // KYL (Kyle of Lochalsh)
		],
	},

	// 9. Far North Line (Dingwall -> Tain -> Lairg -> Helmsdale -> Thurso -> Wick)
	{
		id: "dingwall-wick-thurso",
		name: "Far North Line",
		coordinates: [
			[-4.426, 57.597], // DING
			[-4.32, 57.64], // Alness
			[-4.172, 57.69], // Invergordon
			[-4.053, 57.813], // Tain
			[-4.18, 57.9], // Culrain
			[-4.398, 58.026], // Lairg
			[-4.2, 58.05], // Rogart
			[-3.978, 57.973], // Golspie
			[-3.88, 58.02], // Brora
			[-3.649, 58.12], // Helmsdale
			[-3.72, 58.26], // Kinbrace
			[-3.66, 58.4], // Forsinard
			[-3.527, 58.592], // THS (Thurso)
			[-3.38, 58.54], // Georgemas Junction
			[-3.094, 58.442], // WCK (Wick)
		],
	},

	// 10. Glasgow to Paisley & Ayr (Ayrshire Coast Line)
	{
		id: "glasgow-ayr-stranraer",
		name: "Ayrshire Coast Line",
		coordinates: [
			[-4.258, 55.859], // GLC
			[-4.33, 55.85], // Cardonald
			[-4.427, 55.847], // PYG (Paisley)
			[-4.53, 55.81], // Johnstone
			[-4.66, 55.73], // Lochwinnoch
			[-4.73, 55.65], // Glengarnock
			[-4.69, 55.61], // Kilwinning
			[-4.67, 55.57], // Irvine
			[-4.654, 55.545], // Troon
			[-4.63, 55.5], // Prestwick Airport
			[-4.624, 55.459], // AYR
			[-4.78, 55.22], // Girvan
			[-5.027, 54.906], // STR (Stranraer)
		],
	},

	// 11. Glasgow Central to Carlisle (West Coast Main Line North)
	{
		id: "glasgow-carlisle-wcml",
		name: "West Coast Main Line (Scotland)",
		coordinates: [
			[-4.258, 55.859], // GLC
			[-4.18, 55.82], // Rutherglen
			[-4.07, 55.8], // Cambuslang
			[-3.991, 55.791], // MTH (Motherwell)
			[-3.88, 55.72], // Carluke
			[-3.77, 55.66], // Carstairs
			[-3.66, 55.54],
			[-3.48, 55.32], // Beattock Summit
			[-3.355, 55.123], // Lockerbie
			[-3.18, 54.99], // Gretna Green
			[-2.933, 54.89], // CAR (Carlisle)
		],
	},

	// 12. East Coast Main Line South: Edinburgh Waverley to Berwick
	{
		id: "edinburgh-berwick-ecml",
		name: "East Coast Main Line (South)",
		coordinates: [
			[-3.189, 55.952], // EDB
			[-3.05, 55.945], // Musselburgh
			[-2.95, 55.94], // Prestonpans
			[-2.74, 55.96], // Drem
			[-2.514, 55.998], // Dunbar
			[-2.32, 55.92], // Cockburnspath
			[-2.14, 55.86], // Reston
			[-2.012, 55.774], // BWK (Berwick)
		],
	},

	// 13. Borders Railway: Edinburgh Waverley to Tweedbank
	{
		id: "edinburgh-tweedbank",
		name: "Borders Railway",
		coordinates: [
			[-3.189, 55.952], // EDB
			[-3.09, 55.91], // Shawfair
			[-3.06, 55.87], // Eskbank
			[-3.03, 55.84], // Newtongrange
			[-3.01, 55.79], // Gorebridge
			[-2.92, 55.69], // Stow
			[-2.772, 55.617], // Galashiels
			[-2.756, 55.602], // TWD (Tweedbank)
		],
	},
];

// High-detail coastline polygons extracted from Natural Earth 50m dataset
export const COASTLINES: Coordinate[][] = [
	// 1. Mainland Scotland & Border Outline (High Resolution)
	[
		[-3.9885, 57.5812],
		[-3.8682, 57.6003],
		[-3.6282, 57.6623],
		[-3.4028, 57.7083],
		[-3.2945, 57.7102],
		[-3.0839, 57.6735],
		[-3.036, 57.6723],
		[-2.9467, 57.6893],
		[-2.8563, 57.6923],
		[-2.2441, 57.6809],
		[-2.0741, 57.7024],
		[-1.9615, 57.6767],
		[-1.8674, 57.6124],
		[-1.7779, 57.4937],
		[-1.7807, 57.474],
		[-1.8347, 57.42],
		[-1.9345, 57.3522],
		[-2.0203, 57.2589],
		[-2.0455, 57.2085],
		[-2.0624, 57.1535],
		[-2.0896, 57.1025],
		[-2.2603, 56.8633],
		[-2.4267, 56.7307],
		[-2.501, 56.6366],
		[-2.5927, 56.5616],
		[-2.681, 56.5144],
		[-2.7752, 56.483],
		[-3.0474, 56.4494],
		[-3.1236, 56.4253],
		[-3.2145, 56.3839],
		[-3.31, 56.3635],
		[-3.198, 56.3661],
		[-3.087, 56.3891],
		[-2.8852, 56.3975],
		[-2.6527, 56.3183],
		[-2.6743, 56.2534],
		[-2.7676, 56.2021],
		[-2.9798, 56.1941],
		[-3.1782, 56.0801],
		[-3.2678, 56.0451],
		[-3.3623, 56.0276],
		[-3.4804, 56.0328],
		[-3.6951, 56.0633],
		[-3.7891, 56.0952],
		[-3.7042, 56.0432],
		[-3.6078, 56.016],
		[-3.0487, 55.952],
		[-3.0151, 55.9586],
		[-2.8369, 56.0263],
		[-2.5993, 56.0273],
		[-2.1471, 55.903],
		[-2.0168, 55.808],
		[-1.8303, 55.6717],
		[-1.7288, 55.6186],
		[-1.6554, 55.5704],
		[-1.6102, 55.4981],
		[-1.5226, 55.2595],
		[-1.4227, 55.0264],
		[-3.4646, 54.7731],
		[-3.2679, 54.9066],
		[-3.0362, 54.9531],
		[-3.0811, 54.962],
		[-3.4341, 54.9638],
		[-3.5504, 54.9474],
		[-3.6583, 54.8929],
		[-3.7192, 54.8761],
		[-3.7833, 54.8699],
		[-3.8416, 54.8428],
		[-3.8986, 54.8051],
		[-3.9579, 54.781],
		[-4.0758, 54.7872],
		[-4.133, 54.7792],
		[-4.174, 54.8011],
		[-4.2084, 54.8372],
		[-4.2534, 54.8468],
		[-4.3037, 54.8357],
		[-4.4099, 54.7871],
		[-4.5175, 54.7583],
		[-4.6476, 54.789],
		[-4.8181, 54.8461],
		[-4.8517, 54.8253],
		[-4.8895, 54.7723],
		[-4.9112, 54.6895],
		[-5.0323, 54.7614],
		[-5.1355, 54.8575],
		[-5.1701, 54.9179],
		[-5.1727, 54.9859],
		[-5.1167, 55.0123],
		[-5.0559, 54.9881],
		[-4.9652, 55.1495],
		[-4.7848, 55.3594],
		[-4.7211, 55.421],
		[-4.6768, 55.5013],
		[-4.6844, 55.5539],
		[-4.7242, 55.5983],
		[-4.8918, 55.6991],
		[-4.8896, 55.7812],
		[-4.8717, 55.8739],
		[-4.8261, 55.9295],
		[-4.8068, 55.9401],
		[-4.5841, 55.9387],
		[-4.6709, 55.9674],
		[-4.8441, 56.0512],
		[-4.841, 56.0809],
		[-4.8003, 56.1583],
		[-4.8191, 56.1505],
		[-4.8563, 56.1147],
		[-4.9271, 56.0281],
		[-4.9704, 56.0079],
		[-5.0928, 55.9873],
		[-5.115, 55.9446],
		[-5.1347, 55.9335],
		[-5.1958, 55.9287],
		[-5.2146, 55.8889],
		[-5.2282, 55.8863],
		[-5.2456, 55.9292],
		[-5.2473, 56.0004],
		[-5.2229, 56.0658],
		[-5.1764, 56.117],
		[-4.997, 56.2333],
		[-5.0843, 56.1975],
		[-5.2823, 56.0899],
		[-5.3834, 56.0192],
		[-5.4104, 55.9954],
		[-5.4189, 55.9752],
		[-5.4183, 55.9521],
		[-5.3729, 55.8277],
		[-5.3858, 55.7701],
		[-5.5564, 55.3896],
		[-5.5888, 55.3514],
		[-5.6185, 55.3314],
		[-5.6465, 55.3269],
		[-5.7307, 55.3341],
		[-5.7682, 55.3626],
		[-5.7679, 55.395],
		[-5.7521, 55.4435],
		[-5.6813, 55.624],
		[-5.6506, 55.6741],
		[-5.605, 55.7208],
		[-5.5045, 55.8024],
		[-5.5069, 55.8077],
		[-5.5739, 55.7917],
		[-5.6024, 55.797],
		[-5.6229, 55.8131],
		[-5.6096, 56.0553],
		[-5.5553, 56.135],
		[-5.535, 56.2508],
		[-5.4879, 56.35],
		[-5.4334, 56.4223],
		[-5.3919, 56.5148],
		[-5.3294, 56.5559],
		[-5.3127, 56.6188],
		[-5.2426, 56.6869],
		[-5.1884, 56.7581],
		[-5.2176, 56.751],
		[-5.5642, 56.5657],
		[-5.6524, 56.532],
		[-5.7728, 56.541],
		[-5.8648, 56.5619],
		[-5.9368, 56.6057],
		[-5.9689, 56.6899],
		[-6.0577, 56.6921],
		[-6.1337, 56.7067],
		[-6.1328, 56.718],
		[-6.0347, 56.7639],
		[-5.8776, 56.7796],
		[-5.7306, 56.8531],
		[-5.8614, 56.9027],
		[-5.8504, 56.9184],
		[-5.7363, 56.9606],
		[-5.5913, 57.1023],
		[-5.5619, 57.2327],
		[-5.6312, 57.2939],
		[-5.6563, 57.3341],
		[-5.7949, 57.3788],
		[-5.8181, 57.4361],
		[-5.802, 57.468],
		[-5.7567, 57.4992],
		[-5.6886, 57.5235],
		[-5.5818, 57.5468],
		[-5.6788, 57.5717],
		[-5.7149, 57.6011],
		[-5.7424, 57.6437],
		[-5.7449, 57.6683],
		[-5.6947, 57.7782],
		[-5.6655, 57.8235],
		[-5.6083, 57.8813],
		[-5.349, 57.8781],
		[-5.3192, 57.9036],
		[-5.2898, 57.9046],
		[-5.1572, 57.8813],
		[-5.1769, 57.9064],
		[-5.3937, 58.0436],
		[-5.4132, 58.0697],
		[-5.3514, 58.1437],
		[-5.3469, 58.1767],
		[-5.356, 58.2119],
		[-5.3383, 58.2387],
		[-5.2695, 58.2514],
		[-5.06, 58.2501],
		[-5.0083, 58.2626],
		[-5.0318, 58.2983],
		[-5.0806, 58.3452],
		[-5.0901, 58.3845],
		[-5.0787, 58.4193],
		[-5.076, 58.4893],
		[-5.0665, 58.5202],
		[-5.0167, 58.5666],
		[-4.9756, 58.5803],
		[-4.9247, 58.5884],
		[-4.8096, 58.5729],
		[-4.7658, 58.5542],
		[-4.7154, 58.51],
		[-4.6782, 58.5136],
		[-4.535, 58.5616],
		[-4.4919, 58.5685],
		[-4.4333, 58.5128],
		[-4.1886, 58.5572],
		[-3.8595, 58.5771],
		[-3.6618, 58.6063],
		[-3.4536, 58.6169],
		[-3.2591, 58.65],
		[-3.0531, 58.6348],
		[-3.0462, 58.6155],
		[-3.057, 58.5888],
		[-3.1097, 58.5155],
		[-3.1011, 58.4337],
		[-3.1129, 58.4089],
		[-3.1368, 58.3783],
		[-3.2124, 58.3212],
		[-3.411, 58.2396],
		[-3.775, 58.0521],
		[-3.99, 57.959],
		[-4.0196, 57.9143],
		[-4.0356, 57.852],
		[-3.9068, 57.8396],
		[-3.8571, 57.8186],
		[-3.8879, 57.7869],
		[-4.0784, 57.6771],
		[-4.1345, 57.5777],
		[-3.9885, 57.5812],
	],
	// 2. Isle of Skye
	[
		[-6.3624, 57.2375],
		[-6.3227, 57.2025],
		[-6.2661, 57.1843],
		[-6.1627, 57.1821],
		[-6.0344, 57.2012],
		[-6.0147, 57.052],
		[-5.9873, 57.0444],
		[-5.9491, 57.0452],
		[-5.9138, 57.0626],
		[-5.7954, 57.1465],
		[-5.6962, 57.1984],
		[-5.6687, 57.2269],
		[-5.6725, 57.2527],
		[-5.706, 57.2689],
		[-5.8803, 57.2632],
		[-6.0676, 57.2835],
		[-6.0934, 57.3017],
		[-6.1355, 57.3143],
		[-6.1408, 57.3537],
		[-6.1638, 57.4088],
		[-6.1461, 57.4608],
		[-6.1447, 57.505],
		[-6.1661, 57.5853],
		[-6.2469, 57.6512],
		[-6.306, 57.672],
		[-6.3577, 57.6668],
		[-6.3785, 57.6033],
		[-6.6168, 57.5627],
		[-6.6153, 57.5527],
		[-6.5835, 57.5207],
		[-6.583, 57.5071],
		[-6.6059, 57.4907],
		[-6.6435, 57.4826],
		[-6.7042, 57.4958],
		[-6.7527, 57.4589],
		[-6.7611, 57.4424],
		[-6.7413, 57.4125],
		[-6.6754, 57.3629],
		[-6.4424, 57.3275],
		[-6.3624, 57.2375],
	],
	// 3. Isle of Mull
	[
		[-5.836, 56.5226],
		[-5.9467, 56.5345],
		[-6.0296, 56.6098],
		[-6.1027, 56.6457],
		[-6.1383, 56.6499],
		[-6.1821, 56.643],
		[-6.2863, 56.6119],
		[-6.3063, 56.5988],
		[-6.3197, 56.5694],
		[-6.3106, 56.5521],
		[-6.1389, 56.4906],
		[-6.1849, 56.3569],
		[-6.2985, 56.3392],
		[-6.3258, 56.3209],
		[-6.3134, 56.2937],
		[-6.1762, 56.2887],
		[-5.7779, 56.3443],
		[-5.7608, 56.4907],
		[-5.836, 56.5226],
	],
	// 4. Isle of Arran
	[
		[-5.105, 55.574],
		[-5.1604, 55.6668],
		[-5.1854, 55.691],
		[-5.2516, 55.7169],
		[-5.3181, 55.7092],
		[-5.3457, 55.6907],
		[-5.3708, 55.6669],
		[-5.3927, 55.6184],
		[-5.3315, 55.4811],
		[-5.2771, 55.4567],
		[-5.2315, 55.4481],
		[-5.1054, 55.4488],
		[-5.0947, 55.4943],
		[-5.105, 55.574],
	],
	// 5. Isle of Islay
	[
		[-6.1289, 55.9306],
		[-6.2157, 55.9046],
		[-6.3113, 55.8565],
		[-6.3441, 55.8737],
		[-6.375, 55.8713],
		[-6.4132, 55.8546],
		[-6.4453, 55.8324],
		[-6.4628, 55.8083],
		[-6.4665, 55.769],
		[-6.4957, 55.7116],
		[-6.4914, 55.6973],
		[-6.452, 55.7042],
		[-6.3339, 55.7744],
		[-6.3018, 55.7806],
		[-6.2864, 55.7725],
		[-6.3021, 55.7284],
		[-6.27, 55.6703],
		[-6.3072, 55.6191],
		[-6.3051, 55.6069],
		[-6.2532, 55.6072],
		[-6.0884, 55.6575],
		[-6.0553, 55.6953],
		[-6.0576, 55.7225],
		[-6.0928, 55.8021],
		[-6.1289, 55.9306],
	],
	// 6. Lewis and Harris
	[
		[-6.8538, 57.8265],
		[-6.7966, 57.8275],
		[-6.6833, 57.911],
		[-6.5781, 57.9414],
		[-6.4252, 58.0213],
		[-6.4024, 58.0414],
		[-6.4034, 58.0759],
		[-6.4365, 58.0919],
		[-6.5546, 58.0929],
		[-6.4193, 58.141],
		[-6.3756, 58.1846],
		[-6.3258, 58.1889],
		[-6.1987, 58.3633],
		[-6.1942, 58.4351],
		[-6.2194, 58.4887],
		[-6.2375, 58.5028],
		[-6.2972, 58.4866],
		[-6.5442, 58.3832],
		[-6.7423, 58.3216],
		[-6.7765, 58.3015],
		[-6.7877, 58.2839],
		[-6.7247, 58.1976],
		[-6.7265, 58.1894],
		[-6.8123, 58.1961],
		[-6.8862, 58.1826],
		[-6.9496, 58.2177],
		[-7.0121, 58.2287],
		[-7.0284, 58.2223],
		[-7.0449, 58.2016],
		[-7.0853, 58.1822],
		[-7.0956, 58.1383],
		[-7.0885, 58.0954],
		[-7.0769, 58.079],
		[-7.0382, 58.0723],
		[-7.0169, 58.0548],
		[-6.9853, 58.0505],
		[-7.0519, 58.018],
		[-7.0571, 58.0032],
		[-7.0025, 57.9749],
		[-6.8642, 57.9329],
		[-6.8568, 57.9235],
		[-6.9441, 57.8937],
		[-6.956, 57.8649],
		[-7.0834, 57.8138],
		[-7.0132, 57.7618],
		[-6.9831, 57.75],
		[-6.9569, 57.75],
		[-6.9104, 57.7734],
		[-6.8538, 57.8265],
	],
];
