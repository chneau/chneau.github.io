export const getMoonPhase = (date: Date): { phase: string; icon: string } => {
	let year = date.getFullYear();
	let month = date.getMonth() + 1;
	const day = date.getDate();

	if (month < 3) {
		year--;
		month += 12;
	}

	const c = 365.25 * year;
	const e = 30.6 * month;
	const jd = c + e + day - 694039.09; // jd is total days elapsed
	const b = jd / 29.5305882; // divide by the moon cycle
	const ip = Math.floor(b); // int(b) -> integer part, number of full cycles
	const diff = b - ip; // fractional part: 0 to 1

	// Map fractional part to phase
	// 0.0 - 0.1: New Moon
	// 0.1 - 0.25: Waxing Crescent
	// 0.25 - 0.35: First Quarter
	// 0.35 - 0.6: Waxing Gibbous
	// 0.6 - 0.65: Full Moon
	// 0.65 - 0.75: Waning Gibbous
	// 0.75 - 0.85: Last Quarter
	// 0.85 - 1.0: Waning Crescent

	// Simplified 8-phase map
	const phaseIndex = Math.round(diff * 8) % 8;

	const phases = [
		{ phase: "New Moon", icon: "🌑" },
		{ phase: "Waxing Crescent", icon: "🌒" },
		{ phase: "First Quarter", icon: "🌓" },
		{ phase: "Waxing Gibbous", icon: "🌔" },
		{ phase: "Full Moon", icon: "🌕" },
		{ phase: "Waning Gibbous", icon: "🌖" },
		{ phase: "Last Quarter", icon: "🌗" },
		{ phase: "Waning Crescent", icon: "🌘" },
	];

	return phases[phaseIndex];
};
