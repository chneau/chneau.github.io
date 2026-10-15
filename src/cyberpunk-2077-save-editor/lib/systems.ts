import type { Bytes } from "../../shared";

export type StringPool = {
	readonly names: readonly string[];
	at: (index: number) => string | undefined;
};

export type ObjectField = {
	readonly name: string;
	readonly type: string;
	readonly data: Bytes;
};

type SerialObject = {
	readonly ctypename: string;
	readonly fields: readonly ObjectField[];
	field: (name: string) => ObjectField | undefined;
};

export type SystemsContainer = {
	readonly pool: StringPool;
	readonly objects: readonly SerialObject[];
	find: (ctypename: string) => SerialObject | undefined;
};

export class BlobReader {
	private at = 0;

	constructor(private readonly bytes: Bytes) {}

	get offset(): number {
		return this.at;
	}

	get length(): number {
		return this.bytes.length;
	}

	seek(offset: number): void {
		this.at = offset;
	}

	private take(length: number): DataView {
		return new DataView(this.slice(length).buffer, 0, length);
	}

	u8(): number {
		return this.take(1).getUint8(0);
	}

	u16(): number {
		return this.take(2).getUint16(0, true);
	}

	i16(): number {
		return this.take(2).getInt16(0, true);
	}

	u32(): number {
		return this.take(4).getUint32(0, true);
	}

	i32(): number {
		return this.take(4).getInt32(0, true);
	}

	u64(): bigint {
		return this.take(8).getBigUint64(0, true);
	}

	f32(): number {
		return this.take(4).getFloat32(0, true);
	}

	view(length: number): Bytes {
		if (length < 0 || this.at + length > this.bytes.length) {
			throw new Error(
				`This save's data blob ends early: wanted ${length} byte(s) at offset ${this.at}, but only ${
					this.bytes.length - this.at
				} remain.`,
			);
		}
		const borrowed = this.bytes.subarray(this.at, this.at + length);
		this.at += length;
		return borrowed;
	}

	slice(length: number): Bytes {
		const borrowed = this.view(length);
		const owned = new Uint8Array(borrowed.length);
		owned.set(borrowed);
		return owned;
	}
}

export const sizeOfField = (type: string): number | undefined => {
	switch (type) {
		case "Bool":
		case "Int8":
		case "Uint8":
			return 1;
		case "Int16":
		case "Uint16":
		case "CName":
			return 2;
		case "Int32":
		case "Uint32":
		case "Float32":
			return 4;
		case "Int64":
		case "Uint64":
		case "TweakDBID":
		case "Float64":
			return 8;
		default:
			return type.startsWith("gamedata") ? 2 : undefined;
	}
};

export const readFieldValue = (
	reader: BlobReader,
	type: string,
	pool: StringPool,
): number | bigint | boolean | string | undefined => {
	if (type === "Bool") return reader.u8() !== 0;
	if (type === "Int32") return reader.i32();
	if (type === "Uint32") return reader.u32();
	if (type === "Int16") return reader.i16();
	if (type === "Uint16") return reader.u16();
	if (type === "Uint64" || type === "TweakDBID") return reader.u64();
	if (type === "CName" || type.startsWith("gamedata")) {
		return pool.at(reader.u16()) ?? "";
	}
	return undefined;
};

export const writeFieldValue = (
	blob: Bytes,
	offset: number,
	type: string,
	value: number | bigint | boolean,
): boolean => {
	const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	if (type === "Bool") {
		view.setUint8(offset, value === true || value === 1 ? 1 : 0);
		return true;
	}
	if (type === "Int32") {
		view.setInt32(offset, Number(value), true);
		return true;
	}
	if (type === "Uint32") {
		view.setUint32(offset, Number(value) >>> 0, true);
		return true;
	}
	if (type === "Int16") {
		view.setInt16(offset, Number(value), true);
		return true;
	}
	if (type === "Uint16") {
		view.setUint16(offset, Number(value), true);
		return true;
	}
	if (type === "Uint64" || type === "TweakDBID") {
		view.setBigUint64(offset, BigInt(value), true);
		return true;
	}
	return false;
};

type FieldDescriptor = {
	name: string;
	type: string;
	dataOffset: number;
};

const readPool = (
	blob: Bytes,
	base: number,
	descsSize: number,
	dataSize: number,
): StringPool => {
	if (descsSize % 4 !== 0) {
		throw new Error(
			"This save's string pool has a descriptor table that is not a whole number of entries.",
		);
	}
	const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	const dataEnd = base + descsSize + dataSize;
	const names: string[] = [];
	const count = Math.floor(descsSize / 4);
	for (let index = 0; index < count; index += 1) {
		const packed = view.getUint32(base + index * 4, true);
		const offset = packed & 0x00ffffff;
		const size = ((packed >>> 24) & 0xff) - 1;
		const start = base + offset;
		if (size < 0 || start + size > dataEnd || start + size > blob.length) {
			throw new Error(
				`Entry ${index} of this save's string pool points outside the blob.`,
			);
		}
		names.push(new TextDecoder().decode(blob.slice(start, start + size)));
	}
	return {
		names,
		at: (index: number): string | undefined => {
			if (index < 0) return undefined;
			return names[index];
		},
	};
};

const readObjectFields = (
	blob: Bytes,
	pool: StringPool,
): readonly ObjectField[] => {
	const reader = new BlobReader(blob);
	if (reader.length === 0) return [];
	const fieldCount = reader.u16();
	const descriptors: FieldDescriptor[] = [];
	for (let index = 0; index < fieldCount; index += 1) {
		descriptors.push({
			name: pool.at(reader.u16()) ?? "",
			type: pool.at(reader.u16()) ?? "",
			dataOffset: reader.u32(),
		});
	}
	return descriptors.map((descriptor, position) => {
		const next = descriptors[position + 1]?.dataOffset ?? blob.length;
		const reader = new BlobReader(blob);
		reader.seek(Math.min(Math.max(0, descriptor.dataOffset), blob.length));
		return {
			name: descriptor.name,
			type: descriptor.type,
			data: reader.view(
				Math.max(
					0,
					Math.min(next, blob.length) -
						Math.min(Math.max(0, descriptor.dataOffset), blob.length),
				),
			),
		};
	});
};

const indexByType = (
	objects: readonly SerialObject[],
): Map<string, SerialObject> => {
	const byType = new Map<string, SerialObject>();
	for (const object of objects) {
		if (object.ctypename !== "" && !byType.has(object.ctypename)) {
			byType.set(object.ctypename, object);
		}
	}
	return byType;
};

export const readSystemsContainer = (blob: Bytes): SystemsContainer => {
	const reader = new BlobReader(blob);
	const blobSize = reader.u32();
	if (blobSize <= 0 || blobSize > blob.length) {
		throw new Error(
			`This save's systems blob claims to be ${blobSize} bytes, but its node holds ${blob.length}.`,
		);
	}

	reader.u16();
	reader.u16();
	const cnamesCount = reader.u32();
	const strpoolDescsOffset = reader.u32();
	const strpoolDataOffset = reader.u32();
	const objDescsOffset = reader.u32();
	const objdataOffset = reader.u32();

	if (cnamesCount > 1) {
		const declared = reader.u32();
		if (declared !== cnamesCount) {
			throw new Error(
				"This save's systems blob disagrees with itself about its subsystem handle count.",
			);
		}
		for (let index = 0; index < declared; index += 1) reader.u64();
	}
	const baseOffset = reader.offset;
	const at = (offset: number): number => baseOffset + offset;

	const pool = readPool(
		blob,
		at(strpoolDescsOffset),
		strpoolDataOffset,
		objDescsOffset - strpoolDataOffset,
	);

	const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	const descriptorsAt = at(objDescsOffset);
	const objectCount = Math.floor((objdataOffset - objDescsOffset) / 8);
	const objDescs: { nameIndex: number; dataOffset: number }[] = [];
	for (let index = 0; index < objectCount; index += 1) {
		objDescs.push({
			nameIndex: view.getUint32(descriptorsAt + index * 8, true),
			dataOffset: view.getUint32(descriptorsAt + index * 8 + 4, true),
		});
	}

	const end = baseOffset + blobSize;
	const objects: SerialObject[] = [];
	const bounds = new BlobReader(blob);
	for (const [index, descriptor] of objDescs.entries()) {
		const next = objDescs[index + 1];
		const from = Math.min(Math.max(0, at(descriptor.dataOffset)), blob.length);
		const to = Math.min(
			Math.max(0, next === undefined ? end : at(next.dataOffset)),
			blob.length,
		);
		bounds.seek(from);
		const slice = bounds.view(Math.max(0, to - from));
		const fields = readObjectFields(slice, pool);
		const byName = new Map(fields.map((entry) => [entry.name, entry]));
		objects.push({
			ctypename: pool.at(descriptor.nameIndex) ?? "",
			fields,
			field: (name: string): ObjectField | undefined => byName.get(name),
		});
	}

	const byType = indexByType(objects);
	return {
		pool,
		objects,
		find: (ctypename: string): SerialObject | undefined =>
			byType.get(ctypename),
	};
};

export type SparseEntry = {
	readonly type: string;
	readonly values: ReadonlyMap<string, number | bigint | boolean | string>;
	readonly offsets: ReadonlyMap<string, number>;
};

export const readSparseArray = (
	blob: Bytes,
	pool: StringPool,
): readonly SparseEntry[] => {
	const reader = new BlobReader(blob);
	const count = reader.u32();
	if (count > blob.length) {
		throw new Error(
			`This save's struct array claims ${count} elements, which its ${blob.length} bytes cannot hold.`,
		);
	}
	const entries: SparseEntry[] = [];
	for (let element = 0; element < count; element += 1) {
		const elementAt = reader.offset;
		const fieldCount = reader.u16();
		const descriptors: FieldDescriptor[] = [];
		for (let index = 0; index < fieldCount; index += 1) {
			descriptors.push({
				name: pool.at(reader.u16()) ?? "",
				type: pool.at(reader.u16()) ?? "",
				dataOffset: reader.u32(),
			});
		}

		const values = new Map<string, number | bigint | boolean | string>();
		const offsets = new Map<string, number>();
		for (const descriptor of descriptors) {
			if (sizeOfField(descriptor.type) === undefined) continue;
			offsets.set(descriptor.name, elementAt + descriptor.dataOffset);
			reader.seek(elementAt + descriptor.dataOffset);
			const value = readFieldValue(reader, descriptor.type, pool);
			if (value !== undefined) values.set(descriptor.name, value);
		}

		const last = descriptors[descriptors.length - 1];
		const lastSize = last === undefined ? undefined : sizeOfField(last.type);
		if (last === undefined || lastSize === undefined) break;
		entries.push({
			type: String(values.get("type") ?? ""),
			values,
			offsets,
		});
		reader.seek(elementAt + last.dataOffset + lastSize);
	}
	return entries;
};
