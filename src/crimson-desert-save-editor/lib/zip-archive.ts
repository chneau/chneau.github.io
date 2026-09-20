/**
 * Minimal read-only ZIP reader for the in-memory picture archive.
 *
 * Handles the stored (0) and deflate (8) methods, which is everything the
 * committed picture archives in `assets/image-archive/` use. It reads only the
 * central directory plus, later, the bytes of the entries that are asked for,
 * so no third-party dependency is needed and nothing touches the disk.
 */
export type ZipEntry = {
	name: string;
	method: number;
	compressedSize: number;
	uncompressedSize: number;
	dataOffset: number;
};

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const ZIP64_MARKER = 0xffffffff;

const decoder = new TextDecoder();

const findEndOfCentralDirectory = (view: DataView, length: number): number => {
	const earliest = Math.max(
		0,
		length - END_OF_CENTRAL_DIRECTORY_SIZE - MAX_COMMENT_SIZE,
	);
	for (
		let offset = length - END_OF_CENTRAL_DIRECTORY_SIZE;
		offset >= earliest;
		offset--
	) {
		if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
			return offset;
		}
	}
	throw new Error("Not a ZIP archive: end of central directory not found");
};

/** Reads the central directory into a name -> entry map without inflating anything. */
export const readZipDirectory = (
	bytes: Uint8Array<ArrayBuffer>,
): Map<string, ZipEntry> => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = findEndOfCentralDirectory(view, bytes.byteLength);
	const entryCount = view.getUint16(end + 10, true);
	const entries = new Map<string, ZipEntry>();
	let offset = view.getUint32(end + 16, true);
	for (let index = 0; index < entryCount; index++) {
		if (view.getUint32(offset, true) !== CENTRAL_HEADER_SIGNATURE) {
			throw new Error("Corrupt ZIP archive: bad central directory entry");
		}
		const method = view.getUint16(offset + 10, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const uncompressedSize = view.getUint32(offset + 24, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localOffset = view.getUint32(offset + 42, true);
		if (compressedSize === ZIP64_MARKER || uncompressedSize === ZIP64_MARKER) {
			throw new Error("ZIP64 archives are not supported");
		}
		const name = decoder.decode(
			bytes.subarray(offset + 46, offset + 46 + nameLength),
		);
		if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
			throw new Error(`Corrupt ZIP archive: bad local header for ${name}`);
		}
		const localNameLength = view.getUint16(localOffset + 26, true);
		const localExtraLength = view.getUint16(localOffset + 28, true);
		entries.set(name, {
			name,
			method,
			compressedSize,
			uncompressedSize,
			dataOffset: localOffset + 30 + localNameLength + localExtraLength,
		});
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
};

/** Returns the raw stored bytes, or inflates a deflated entry. */
export const readZipEntry = async (
	bytes: Uint8Array<ArrayBuffer>,
	entry: ZipEntry,
): Promise<Uint8Array<ArrayBuffer>> => {
	const compressed = bytes.subarray(
		entry.dataOffset,
		entry.dataOffset + entry.compressedSize,
	);
	if (entry.method === 0) return compressed;
	if (entry.method !== 8) {
		throw new Error(
			`Unsupported compression method ${entry.method} for ${entry.name}`,
		);
	}
	const stream = new Blob([compressed])
		.stream()
		.pipeThrough(new DecompressionStream("deflate-raw"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
};
