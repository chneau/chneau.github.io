/**
 * Timetable & Train Schedule Generation / Export script for Scotland Rail
 * Compiles and validates all scheduled services across operators:
 * ScotRail Express, ScotRail Inter7City, ScotRail Scenic, ScotRail Suburban,
 * LNER, Avanti West Coast, CrossCountry, and Caledonian Sleeper.
 */

import { generateSchedule } from "./data/schedule";
import type { Category, TrainService } from "./data/types";

const buildScheduleSummary = (services: TrainService[]) => {
	const categoryCounts: Record<Category, number> = {
		Express: 0,
		Highland: 0,
		Commuter: 0,
		CrossBorder: 0,
		Sleeper: 0,
	};

	const operatorCounts: Record<string, number> = {};

	for (const service of services) {
		categoryCounts[service.category] =
			(categoryCounts[service.category] || 0) + 1;
		operatorCounts[service.operator] =
			(operatorCounts[service.operator] || 0) + 1;
	}

	return {
		totalServices: services.length,
		categoryCounts,
		operatorCounts,
	};
};

// Execute if run directly with Bun
if (import.meta.main) {
	console.log("[1/3] Generating full Scottish 24-hour rail timetable...");
	const services = generateSchedule();

	console.log(`[2/3] Validating ${services.length} services...`);
	for (const s of services) {
		if (s.calls.length < 2) {
			throw new Error(`Service ${s.id} (${s.name}) has fewer than 2 stops!`);
		}
		if (s.pathCoordinates.length < 2) {
			throw new Error(
				`Service ${s.id} (${s.name}) has an invalid path geometry!`,
			);
		}
	}

	const summary = buildScheduleSummary(services);

	console.log("\n--- Timetable Summary ---");
	console.log(`Total Daily Trains: ${summary.totalServices}`);
	console.log("\nBy Category:");
	for (const [cat, count] of Object.entries(summary.categoryCounts)) {
		console.log(`  - ${cat}: ${count} services`);
	}

	console.log("\nBy Operator:");
	for (const [op, count] of Object.entries(summary.operatorCounts)) {
		console.log(`  - ${op}: ${count} services`);
	}

	console.log("\n[3/3] Done. All train schedules are verified and active.");
}
