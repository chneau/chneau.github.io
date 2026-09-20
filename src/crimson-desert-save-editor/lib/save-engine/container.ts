/**
 * TypeScript port of `public/python/editor/save_container.py`.
 *
 * HMAC-SHA256 is provided by WebCrypto, so `decodeSave`/`encodeSave` are
 * async (the original Python uses synchronous `hashlib`/`hmac`).
 */

import {
	bytesEqual,
	concatBytes,
	fromHex,
	readU16,
	readU32,
	writeU16,
	writeU32,
} from "./bytes";
import { chacha20, lz4Compress, lz4Decompress } from "./codec";

const MAGIC = new Uint8Array([0x53, 0x41, 0x56, 0x45]); // b"SAVE"
const HEADER_SIZE = 0x80;
const VERSION_OFFSET = 0x04;
const FLAGS_OFFSET = 0x06;
const UNCOMPRESSED_SIZE_OFFSET = 0x12;
const PAYLOAD_SIZE_OFFSET = 0x16;
const NONCE_OFFSET = 0x1a;
const HMAC_OFFSET = 0x2a;
const PAYLOAD_OFFSET = HEADER_SIZE;

const SAVE_BASE_KEY = fromHex(
	"c41b8e730df259a637cc04e9b12f9668da107a853e61f9224db80ad75c13ef",
);
const VERSION_PREFIXES: Record<number, Uint8Array> = {
	1: fromHex("5e516762726d2f2e2340607a73725d5c40727666616c2322"),
	2: fromHex("5e506561726c2d2d2341627973735f5f402121"),
};
const HMAC_SECRET = new TextEncoder().encode("PRIVATE_HMAC_SECRET_CHECK");

class SaveContainerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SaveContainerError";
	}
}

export type SaveHeader = {
	version: number;
	flags: number;
	uncompressedSize: number;
	payloadSize: number;
	nonce: Uint8Array;
	digest: Uint8Array;
	raw: Uint8Array;
};

/**
 * A decoded save: the Payload, plus the Container fields a caller needs to
 * describe it. The compressed bytes are deliberately absent, so a caller is
 * handed the payload alone and a session that retains a decode retains one copy
 * of it.
 */
export type DecodedSave = {
	header: SaveHeader;
	rawPayload: Uint8Array;
};

/** What `decodeSave` returns: a `DecodedSave` plus the bytes it decompressed. */
type DecodeResult = DecodedSave & {
	compressedPayload: Uint8Array;
};

const saveKey = (version: number): Uint8Array => {
	const prefix = VERSION_PREFIXES[version];
	if (prefix === undefined) {
		throw new SaveContainerError(
			`Unsupported save-container version ${version}`,
		);
	}
	const material = concatBytes(prefix, HMAC_SECRET);
	const length = Math.min(SAVE_BASE_KEY.length, material.length);
	const key = new Uint8Array(length + 1);
	for (let index = 0; index < length; index++) {
		key[index] = (SAVE_BASE_KEY[index] ?? 0) ^ (material[index] ?? 0);
	}
	return key;
};

const parseHeader = (data: Uint8Array): SaveHeader => {
	if (data.length < HEADER_SIZE) {
		throw new SaveContainerError(`Save is truncated: ${data.length} bytes`);
	}
	if (!bytesEqual(data.subarray(0, 4), MAGIC)) {
		throw new SaveContainerError(
			`Invalid magic ${hex(data.subarray(0, 4))}; expected ${hex(MAGIC)}`,
		);
	}
	const version = readU16(data, VERSION_OFFSET);
	const flags = readU16(data, FLAGS_OFFSET);
	const uncompressedSize = readU32(data, UNCOMPRESSED_SIZE_OFFSET);
	const payloadSize = readU32(data, PAYLOAD_SIZE_OFFSET);
	const end = PAYLOAD_OFFSET + payloadSize;
	if (end !== data.length) {
		throw new SaveContainerError(
			`Payload/file-size mismatch: header ends at ${end}, file is ${data.length} bytes`,
		);
	}
	return {
		version,
		flags,
		uncompressedSize,
		payloadSize,
		nonce: data.slice(NONCE_OFFSET, NONCE_OFFSET + 16),
		digest: data.slice(HMAC_OFFSET, HMAC_OFFSET + 32),
		raw: data.slice(0, HEADER_SIZE),
	};
};

const hex = (data: Uint8Array): string => {
	let output = "";
	for (const byte of data) output += byte.toString(16).padStart(2, "0");
	return output;
};

const hmacKeys = new Map<Uint8Array, Promise<CryptoKey>>();

const hmacSha256 = async (
	key: Uint8Array,
	message: Uint8Array,
): Promise<Uint8Array> => {
	// `importKey` is pure: the same bytes always yield an equivalent key, so
	// cache the import per key and only pay for the sign operation per call.
	let cryptoKey = hmacKeys.get(key);
	if (cryptoKey === undefined) {
		cryptoKey = crypto.subtle.importKey(
			"raw",
			key as BufferSource,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		hmacKeys.set(key, cryptoKey);
	}
	const signature = await crypto.subtle.sign(
		"HMAC",
		await cryptoKey,
		message as BufferSource,
	);
	return new Uint8Array(signature);
};

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let index = 0; index < a.length; index++) {
		difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
	}
	return difference === 0;
};

export const decodeSave = async (data: Uint8Array): Promise<DecodeResult> => {
	const header = parseHeader(data);
	const key = saveKey(header.version);
	const encrypted = data.subarray(PAYLOAD_OFFSET);
	const compressed = chacha20(encrypted, header.nonce, key);
	const actualDigest = await hmacSha256(key, compressed);
	if (!constantTimeEqual(actualDigest, header.digest)) {
		throw new SaveContainerError("HMAC verification failed; refusing to parse");
	}
	const raw = lz4Decompress(compressed, header.uncompressedSize);
	return { header, compressedPayload: compressed, rawPayload: raw };
};

export const encodeSave = async (
	rawPayload: Uint8Array,
	original: SaveHeader,
): Promise<Uint8Array> => {
	const key = saveKey(original.version);
	const compressed = lz4Compress(rawPayload);
	const nonce = crypto.getRandomValues(new Uint8Array(16));
	const digest = await hmacSha256(key, compressed);
	const encrypted = chacha20(compressed, nonce, key);
	const header = original.raw.slice();
	header.set(MAGIC, 0);
	writeU16(header, VERSION_OFFSET, original.version);
	writeU16(header, FLAGS_OFFSET, original.flags);
	writeU32(header, UNCOMPRESSED_SIZE_OFFSET, rawPayload.length);
	writeU32(header, PAYLOAD_SIZE_OFFSET, compressed.length);
	header.set(nonce, NONCE_OFFSET);
	header.set(digest, HMAC_OFFSET);
	return concatBytes(header, encrypted);
};
