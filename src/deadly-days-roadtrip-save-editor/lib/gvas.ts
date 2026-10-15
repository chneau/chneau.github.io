import {
	type Bytes,
	type JsonValue,
	requireArrayAt,
	requireNumberAt,
	requireObjectAt,
	requireStringAt,
} from "../../shared";
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

const MAGIC = "GVAS";

type EngineVersion = {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	readonly changelist: number;
	readonly branch: string;
};

type CustomVersion = {
	readonly id: string;
	readonly version: number;
};

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
	return new Uint8Array(writer.finish());
};

export const gvasOf = (value: JsonValue): GvasSave => {
	const engine = requireObjectAt(value, "engine");
	const list = requireObjectAt(value, "list");
	return {
		magic: requireStringAt(value, "magic"),
		fileVersion: requireNumberAt(value, "fileVersion"),
		saveGameVersion: requireNumberAt(value, "saveGameVersion"),
		packageFileUE5Version: requireNumberAt(value, "packageFileUE5Version"),
		engine: {
			major: requireNumberAt(engine, "major"),
			minor: requireNumberAt(engine, "minor"),
			patch: requireNumberAt(engine, "patch"),
			changelist: requireNumberAt(engine, "changelist"),
			branch: requireStringAt(engine, "branch"),
		},
		customVersionFormat: requireNumberAt(value, "customVersionFormat"),
		customVersions: requireArrayAt(value, "customVersions").map((entry) => ({
			id: requireStringAt(entry, "id"),
			version: requireNumberAt(entry, "version"),
		})),
		saveGameType: requireStringAt(value, "saveGameType"),
		containerTag: requireNumberAt(value, "containerTag"),
		list: {
			properties: requireArrayAt(list, "properties").map(propertyTagOf),
			trailing: requireStringAt(list, "trailing"),
		},
	};
};
