/**
 * The GVAS container: the outer shell of a *Deadly Days: Roadtrip* save.
 *
 * ## The layout, measured from the file rather than recalled from a spec
 *
 * Everything is little-endian and every integer and string is a
 * `FArchive` primitive. Offsets below are from the committed
 * `SaveSlot_DDR_0.sav` and were established by perturbing a single header field
 * at a time through the `uesave` v0.7.1 CLI and diffing the bytes it wrote —
 * the header is 1 803 bytes long and three of its fields are not what their
 * names in any documentation suggest.
 *
 * ```text
 *   0  char[4]   "GVAS"
 *   4  int32     SaveGameFileVersion            3
 *   8  int32     SaveGameVersion                522   (the UE4 package version)
 *  12  int32     PackageFileUE5Version        1 018
 *  16  uint16    FEngineVersion.Major            5
 *  18  uint16    FEngineVersion.Minor            7
 *  20  uint16    FEngineVersion.Patch            4
 *  22  uint32    FEngineVersion.Changelist  51 494 982
 *  26  FString   FEngineVersion.Branch  "++UE5+Release-5.7"
 *  48  int32     CustomVersionFormat             3
 *  52  int32     CustomVersionCount             85
 *  56  85 × { GUID tag, int32 version }       56 … 1 756
 * 1 756  FString   the save class  "/Script/PixelsplitSaveSystem.PixelSaveGame"
 * 1 803  uint8     an unlabelled byte, always 0 — see below
 * 1 804  the property list
 * ```
 *
 * ## The unlabelled byte
 *
 * One byte sits between the class name and the first property tag, and it is 0
 * in every save from this game. It is not the property list: writing `1` there
 * leaves a file that still decodes, with every field intact. `uesave` writes it
 * and ignores it on the way back in, which is all that is known about it, so it
 * is carried through verbatim under the name `containerTag` rather than given a
 * meaning it has not been shown to have. Preserving it is what makes an
 * untouched save re-encode to identical bytes.
 *
 * ## The 85 custom versions
 *
 * The largest single thing in the header, and the easiest thing to lose: drop or
 * reformat the custom-version table and the engine refuses the package. The GUIDs
 * use the same word-swapped layout as every other GUID in Unreal, spelled out in
 * `properties.ts`.
 */

import { type Bytes, isJsonObject, type JsonValue } from "../../shared";
import {
	type PropertyList,
	propertyTagOf,
	readGuid,
	readTerminalList,
	UnrealReader,
	UnrealWriter,
	writeGuid,
	writePropertiesList,
} from "./properties";

/** The four ASCII bytes every GVAS file opens with. */
const MAGIC = "GVAS";

type EngineVersion = {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	readonly changelist: number;
	readonly branch: string;
};

/** One entry of `FCustomVersionContainer`: a feature GUID and its version. */
type CustomVersion = {
	readonly id: string;
	readonly version: number;
};

/**
 * A whole save, as a document.
 *
 * A type alias of object literals rather than an `interface`, so it carries an
 * implicit index signature and is therefore assignable to the shared
 * `JsonValue` — the document the workbench edits is this value, not a copy of
 * it, and the inspector can navigate to any field below without a conversion in
 * between.
 */
type GvasSave = {
	readonly magic: string;
	readonly fileVersion: number;
	readonly saveGameVersion: number;
	readonly packageFileUE5Version: number;
	readonly engine: EngineVersion;
	readonly customVersionFormat: number;
	readonly customVersions: readonly CustomVersion[];
	readonly saveGameType: string;
	readonly containerTag: number;
	readonly list: PropertyList;
};

export const readGvas = (bytes: Bytes): GvasSave => {
	const reader = new UnrealReader(bytes);
	const magic = reader.latin1(4, "magic");
	if (magic !== MAGIC) {
		throw new Error(
			`This is not an Unreal save: it opens with "${magic.replace(
				/[^\x20-\x7e]/g,
				".",
			)}" rather than "GVAS".`,
		);
	}
	const fileVersion = reader.i32("SaveGameFileVersion");
	const saveGameVersion = reader.i32("SaveGameVersion");
	const packageFileUE5Version = reader.i32("PackageFileUE5Version");
	const engine: EngineVersion = {
		major: reader.u16("FEngineVersion.Major"),
		minor: reader.u16("FEngineVersion.Minor"),
		patch: reader.u16("FEngineVersion.Patch"),
		changelist: reader.u32("FEngineVersion.Changelist"),
		branch: reader.fString("FEngineVersion.Branch"),
	};
	const customVersionFormat = reader.i32("CustomVersionFormat");
	const customVersionCount = reader.i32("CustomVersionCount");
	if (customVersionCount < 0 || customVersionCount > reader.remaining) {
		throw new Error(
			`The header claims ${customVersionCount} custom versions, which the remaining ${reader.remaining} byte(s) cannot hold.`,
		);
	}
	const customVersions: CustomVersion[] = [];
	for (let index = 0; index < customVersionCount; index += 1) {
		customVersions.push({
			id: readGuid(reader, `custom version ${index}`),
			version: reader.i32(`custom version ${index} value`),
		});
	}
	const saveGameType = reader.fString("save class name");
	const containerTag = reader.u8("container tag");
	return {
		magic,
		fileVersion,
		saveGameVersion,
		packageFileUE5Version,
		engine,
		customVersionFormat,
		customVersions,
		saveGameType,
		containerTag,
		list: readTerminalList(reader),
	};
};

export const writeGvas = (save: GvasSave): Bytes => {
	const writer = new UnrealWriter();
	writer.latin1(MAGIC);
	writer.i32(save.fileVersion);
	writer.i32(save.saveGameVersion);
	writer.i32(save.packageFileUE5Version);
	writer.u16(save.engine.major);
	writer.u16(save.engine.minor);
	writer.u16(save.engine.patch);
	writer.u32(save.engine.changelist);
	writer.fString(save.engine.branch);
	writer.i32(save.customVersionFormat);
	writer.i32(save.customVersions.length);
	for (const [index, custom] of save.customVersions.entries()) {
		writeGuid(writer, custom.id, `custom version ${index}`);
		writer.i32(custom.version);
	}
	writer.fString(save.saveGameType);
	writer.u8(save.containerTag);
	writePropertiesList(writer, save.list);
	// `ByteWriter.finish` is declared over the element-less `Uint8Array`, which
	// admits a `SharedArrayBuffer` and so is not the `Bytes` this codec promises.
	// Copying into a fresh buffer is what makes the promise true rather than
	// asserted, and it is one copy of a file the user already has in memory.
	return new Uint8Array(writer.finish());
};

const numberField = (value: JsonValue, key: string): number => {
	const found = isJsonObject(value) ? value[key] : undefined;
	if (typeof found !== "number" || !Number.isFinite(found)) {
		throw new Error(`"${key}" must be a finite number.`);
	}
	return found;
};

const stringField = (value: JsonValue, key: string): string => {
	const found = isJsonObject(value) ? value[key] : undefined;
	if (typeof found !== "string") {
		throw new Error(`"${key}" must be a string.`);
	}
	return found;
};

const listField = (value: JsonValue, key: string): readonly JsonValue[] => {
	const found = isJsonObject(value) ? value[key] : undefined;
	if (!Array.isArray(found)) {
		throw new Error(`"${key}" must be an array.`);
	}
	return found;
};

const objectField = (value: JsonValue, key: string): JsonValue => {
	const found = isJsonObject(value) ? value[key] : undefined;
	if (found === undefined || typeof found !== "object" || found === null) {
		throw new Error(`"${key}" must be an object.`);
	}
	return found;
};

/**
 * Rebuilds a typed save from an edited document.
 *
 * Same reasoning as the property codec's equivalent: the inspector replaces
 * leaves in place, so every field is checked on the way out and a document that
 * has lost one is refused with a message naming it. That is a better outcome
 * than a cast and a file the game silently rejects.
 */
export const gvasOf = (value: JsonValue): GvasSave => {
	const engine = objectField(value, "engine");
	const list = objectField(value, "list");
	return {
		magic: stringField(value, "magic"),
		fileVersion: numberField(value, "fileVersion"),
		saveGameVersion: numberField(value, "saveGameVersion"),
		packageFileUE5Version: numberField(value, "packageFileUE5Version"),
		engine: {
			major: numberField(engine, "major"),
			minor: numberField(engine, "minor"),
			patch: numberField(engine, "patch"),
			changelist: numberField(engine, "changelist"),
			branch: stringField(engine, "branch"),
		},
		customVersionFormat: numberField(value, "customVersionFormat"),
		customVersions: listField(value, "customVersions").map((entry) => ({
			id: stringField(entry, "id"),
			version: numberField(entry, "version"),
		})),
		saveGameType: stringField(value, "saveGameType"),
		containerTag: numberField(value, "containerTag"),
		list: {
			properties: listField(list, "properties").map(propertyTagOf),
			trailing: stringField(list, "trailing"),
		},
	};
};
