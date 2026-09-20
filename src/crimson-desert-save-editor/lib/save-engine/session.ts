/**
 * In-page save engine session.
 *
 * The engine runs directly on the main thread — no worker, no separate bundle.
 * Callers get the same event stream the worker used to post (`status`,
 * `progress`, `result`, `edited`, `error`).
 */

import {
	describeInventory,
	type InventoryDescription,
} from "./browser-equipment";
import { describeSkills, type SkillDescription } from "./browser-skills";
import { type CharacterDescription, describeCharacters } from "./characters";
import {
	type CompanionNameDescription,
	describeCompanionNames,
} from "./companion-names";
import { type CompanionDescription, describeCompanions } from "./companions";
import { type DecodedSave, decodeSave } from "./container";
import { type DyeDescription, describeDyes } from "./dyes";
import { type EditAudit, planSaveEdits, type SaveEdit } from "./edits";
import { describeError } from "./errors";
import {
	type ConditionDescription,
	describeItemConditions,
} from "./item-condition";
import { describeQuests, type QuestDescription } from "./quests";

type SaveParseResult = InventoryDescription & {
	companions: CompanionDescription;
	skills: SkillDescription;
	dyes: DyeDescription;
	levels: CharacterDescription;
	names: CompanionNameDescription;
	conditions: ConditionDescription;
};

export type SaveEngineEvent =
	| { type: "status"; message: string }
	| { type: "progress"; completed: number; total: number; message: string }
	| { type: "result"; payload: SaveParseResult }
	| {
			type: "edited";
			buffer: ArrayBuffer;
			audits: EditAudit[];
	  }
	| { type: "error"; message: string };

type EmitSaveEngineEvent = (event: SaveEngineEvent) => void;

/**
 * Hands the main thread back to the browser.
 *
 * The engine runs in the page, and one edit re-serializes, re-encrypts and
 * re-parses the whole save, so a storage's worth of edits can hold the thread
 * for minutes. Without yielding, the tab cannot paint: the progress bar stands
 * still and the browser eventually offers to kill the page. A macrotask is
 * what is needed here — a microtask would drain before the browser renders.
 */
const yieldToBrowser = (): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

export class SaveSession {
	private sourceBytes: Uint8Array | null = null;
	/** The decode the parse paid for, shared with every later description. */
	private decoded: DecodedSave | null = null;
	private generation = 0;
	private queue: Promise<void> = Promise.resolve();

	/** Drops the open save and invalidates in-flight results. */
	reset(): void {
		this.generation += 1;
		this.sourceBytes = null;
		this.decoded = null;
		this.queue = Promise.resolve();
	}

	/** Reads a save and emits the parsed inventory plus companion roster. */
	parse(buffer: ArrayBuffer, emit: EmitSaveEngineEvent): Promise<void> {
		const generation = this.generation;
		const run = this.queue.then(async () => {
			if (generation !== this.generation) return;
			try {
				emit({ type: "status", message: "Verifying and reading save…" });
				const source = new Uint8Array(buffer);
				// One decode for the whole parse: every describer takes the payload
				// instead of decoding the same bytes again.
				const decoded = await decodeSave(source);
				const payload: SaveParseResult = {
					...(await describeInventory(decoded)),
					companions: await describeCompanions(decoded),
					skills: await describeSkills(decoded),
					dyes: await describeDyes(decoded),
					levels: await describeCharacters(decoded),
					names: await describeCompanionNames(decoded),
					conditions: await describeItemConditions(decoded),
				};
				if (generation !== this.generation) return;
				this.sourceBytes = source;
				this.decoded = decoded;
				emit({ type: "result", payload });
			} catch (error) {
				if (generation === this.generation) {
					emit({ type: "error", message: describeError(error) });
				}
			}
		});
		this.queue = run;
		return run;
	}

	/**
	 * Reads the quest tables of the open save.
	 *
	 * Quest rows outnumber everything else in the save — around 57,000 stage rows
	 * against a few thousand inventory records — so this is the one description
	 * the parse does not collect up front. The quest panel asks for it when it
	 * opens, and the result is left to the panel rather than cached here.
	 */
	describeQuests(): Promise<QuestDescription> {
		if (!this.decoded) {
			throw new Error("Open a save before reading quests.");
		}
		return describeQuests(this.decoded);
	}

	/** Applies staged edits to the open save and emits the edited bytes. */
	apply(operations: SaveEdit[], emit: EmitSaveEngineEvent): Promise<void> {
		const generation = this.generation;
		const run = this.queue.then(async () => {
			if (generation !== this.generation) return;
			try {
				const { bytes, audits } = await this.runApply(operations, emit);
				if (generation !== this.generation) return;
				const buffer = bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength,
				) as ArrayBuffer;
				emit({ type: "edited", buffer, audits });
			} catch (error) {
				if (generation === this.generation) {
					emit({ type: "error", message: describeError(error) });
				}
			}
		});
		this.queue = run;
		return run;
	}

	private async runApply(
		operations: SaveEdit[],
		emit: EmitSaveEngineEvent,
	): Promise<{ bytes: Uint8Array; audits: EditAudit[] }> {
		if (!this.sourceBytes) {
			throw new Error("Open a save before applying changes.");
		}
		emit({ type: "status", message: "Validating edits and rebuilding save…" });
		const runs = planSaveEdits(Array.isArray(operations) ? operations : []);
		const total = runs.reduce((sum, run) => sum + run.size, 0) + 1;
		let completed = 0;
		let edited = this.sourceBytes;
		const audits: EditAudit[] = [];
		for (const run of runs) {
			emit({ type: "progress", completed, total, message: run.label });
			await yieldToBrowser();
			const [next, runAudits] = await run.run(edited, async (done) => {
				emit({
					type: "progress",
					completed: completed + done,
					total,
					message: run.label,
				});
				await yieldToBrowser();
			});
			edited = next;
			audits.push(...runAudits);
			completed += run.size;
		}
		emit({ type: "progress", completed, total, message: "Preparing download" });
		await yieldToBrowser();
		return { bytes: edited, audits };
	}
}
