import { describe, expect, test } from "bun:test";
import { STATIONS, STATIONS_BY_ID } from "../data/geography";
import TIMETABLE_DATA from "../data/timetable.json";
import type { TrainService } from "../data/types";
import { resolveServiceAtTime } from "../engine/interpolator";

/**
 * The arrival minute belongs to the station, not to the track.
 *
 * The leg test was `timeOffset >= depTime && timeOffset <= arrTime`, so the
 * inclusive upper bound always won the race against the dwell test on the
 * next loop iteration (which needs `timeOffset >= arrivalOffset`). Measured
 * over the whole timetable: at the exact arrival minute all 325 services
 * reported "In transit to <dest>", dwell was observable for 2.5% of active
 * (service, minute) pairs, and the terminus-dwelling fallback below the loop
 * was unreachable - 0 services, and no state with `headingAngle: 0` or
 * `progress: 1` produced by it.
 */

const services = TIMETABLE_DATA as unknown as TrainService[];
const namesById = new Map(STATIONS.map((s) => [s.id, s.name]));

type Call = TrainService["calls"][number];

const withIntermediateDwell = (minMinutes: number): [TrainService, Call] => {
	for (const service of services) {
		for (let i = 1; i < service.calls.length - 1; i++) {
			const call = service.calls[i];
			if (!call || call.arrivalOffset === null) continue;
			if (call.departureOffset === null) continue;
			if (call.departureOffset - call.arrivalOffset >= minMinutes) {
				return [service, call];
			}
		}
	}
	throw new Error(
		`no service with an intermediate dwell of ${minMinutes}+ min`,
	);
};

const at = (service: TrainService, minute: number) =>
	resolveServiceAtTime(service, minute, namesById);

describe("dwelling at an intermediate call", () => {
	test("the arrival minute dwells at the station, not in transit", () => {
		const [service, call] = withIntermediateDwell(3);
		const arrival = call.arrivalOffset ?? 0;

		const state = at(service, arrival);
		expect(state).not.toBeNull();
		if (!state) return;
		expect(state.isDwelling).toBe(true);
		expect(state.currentStopName).toBe(
			namesById.get(call.stationId) ?? call.stationId,
		);
		// A dwelling train is oriented along the platform, not down the line.
		expect(state.headingAngle).toBe(0);
		expect(state.nextStopName).not.toBe(
			namesById.get(call.stationId) ?? call.stationId,
		);
	});

	test("the minute before arrival is still in transit", () => {
		const [service, call] = withIntermediateDwell(3);
		const arrival = call.arrivalOffset ?? 0;

		const state = at(service, arrival - 1);
		expect(state).not.toBeNull();
		if (!state) return;
		expect(state.isDwelling).toBe(false);
		expect(state.currentStopName).not.toBe(
			namesById.get(call.stationId) ?? call.stationId,
		);
	});

	test("the whole recorded dwell is observable, and departure ends it", () => {
		const [service, call] = withIntermediateDwell(2);
		const arrival = call.arrivalOffset ?? 0;
		const departure = call.departureOffset ?? 0;

		for (let minute = arrival; minute < departure; minute++) {
			expect(at(service, minute)?.isDwelling).toBe(true);
		}
		expect(at(service, departure)?.isDwelling).toBe(false);
	});
});

describe("dwelling at the terminus", () => {
	test("the arrival minute reaches the terminus-dwelling state", () => {
		for (const service of services) {
			const last = service.calls[service.calls.length - 1];
			if (!last || last.arrivalOffset === null) continue;

			const state = at(service, last.arrivalOffset);
			expect(state).not.toBeNull();
			if (!state) continue;

			// The regression: every one of these reported "In transit to
			// <dest>" because the leg test swallowed the arrival minute.
			expect(state.isDwelling).toBe(true);
			expect(state.currentStopName).toBe(
				namesById.get(last.stationId) ?? last.stationId,
			);
			expect(state.nextStopName).toBeNull();
			expect(state.progress).toBe(1);
			expect(state.headingAngle).toBe(0);
			// Parked on the platform, not at the end of the polyline.
			const station = STATIONS_BY_ID.get(last.stationId);
			if (!station) throw new Error(`unknown station ${last.stationId}`);
			expect([...state.position]).toEqual([...station.coordinate]);
		}
	});

	test("no service still reports in-transit at its final arrival minute", () => {
		const stragglers = services.filter((service) => {
			const last = service.calls[service.calls.length - 1];
			if (!last || last.arrivalOffset === null) return false;
			return at(service, last.arrivalOffset)?.isDwelling !== true;
		});
		expect(stragglers.map((s) => s.id)).toEqual([]);
	});
});

describe("the leg boundary dropped no minute", () => {
	test("every minute of every service window still resolves to a state", () => {
		const gaps: string[] = [];
		for (const service of services) {
			const first = service.calls[0];
			const last = service.calls[service.calls.length - 1];
			if (!first || !last) continue;
			const start = first.departureOffset ?? first.arrivalOffset ?? 0;
			const finish = last.arrivalOffset ?? last.departureOffset ?? 0;
			// Quarter-minute resolution: scrubbing lands on whole minutes,
			// playback does not.
			for (let t = start; t <= finish; t += 0.25) {
				if (!resolveServiceAtTime(service, t, namesById)) {
					gaps.push(`${service.id}@${t.toFixed(2)}`);
				}
			}
		}
		expect(gaps.slice(0, 10)).toEqual([]);
		expect(gaps).toHaveLength(0);
	});

	test("dwelling is now a meaningful share of the active timeline", () => {
		let pairs = 0;
		let dwelling = 0;
		for (const service of services) {
			for (let minute = 300; minute <= 1440; minute++) {
				const state = at(service, minute);
				if (!state) continue;
				pairs++;
				if (state.isDwelling) dwelling++;
			}
		}
		expect(pairs).toBeGreaterThan(20000);
		// Was 2.53% before the boundary fix; the 554 one-minute dwells alone
		// make up the difference, since the arrival minute used to be "moving".
		expect(dwelling / pairs).toBeGreaterThan(0.05);
	});
});
