/**
 * WebCrypto helpers for the formats that are genuinely encrypted.
 *
 * Only Power Fantasy among the six actually uses real cryptography — the
 * others are compression, XOR or structural parsing. It is here rather than in
 * that app because the browser primitives are fiddly in ways worth writing
 * down once, and a save editor has no business hand-rolling AES.
 */
import type { Bytes } from "./bytes";

/** PBKDF2-SHA1, the KDF Unity's `Rfc2898DeriveBytes` produces by default. */
export const pbkdf2Sha1 = async (
	password: string,
	salt: Bytes,
	iterations: number,
	keyLength: number,
): Promise<Bytes> => {
	// The salt and the password both enter as raw bytes. Importing the
	// password as UTF-8 is what `Rfc2898DeriveBytes(string, …)` does, so a
	// non-ASCII password has to be encoded the same way or the derived key
	// silently differs and nothing decodes.
	const material = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-1", salt, iterations },
		material,
		keyLength * 8,
	);
	return new Uint8Array(bits);
};

/**
 * AES-CBC decrypt.
 *
 * WebCrypto's AES-CBC is PKCS#7 only and always strips padding on decrypt, which
 * is the same default `createDecipheriv` applies in Node — so a file encrypted
 * by either side reads back here without a shim. A container that pads
 * manually (some Unity games do) is handled by its own codec, not here.
 */
export const aesCbcDecrypt = async (
	key: Bytes,
	iv: Bytes,
	ciphertext: Bytes,
): Promise<Bytes> => {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "AES-CBC" },
		false,
		["decrypt"],
	);
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-CBC", iv },
		cryptoKey,
		ciphertext,
	);
	return new Uint8Array(plain);
};

/** AES-CBC encrypt, the inverse of `aesCbcDecrypt`. */
export const aesCbcEncrypt = async (
	key: Bytes,
	iv: Bytes,
	plaintext: Bytes,
): Promise<Bytes> => {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "AES-CBC" },
		false,
		["encrypt"],
	);
	const sealed = await crypto.subtle.encrypt(
		{ name: "AES-CBC", iv },
		cryptoKey,
		plaintext,
	);
	return new Uint8Array(sealed);
};

/** Single-byte XOR, the scheme two of the six mobile formats use. */
export const xorBytes = (bytes: Bytes, key: number): Bytes => {
	const out = new Uint8Array(bytes.length);
	for (const [index, byte] of bytes.entries()) out[index] = byte ^ key;
	return out;
};

/** Base64 decode that tolerates whitespace, which wrapped payloads carry. */
export const base64Decode = (text: string): Bytes => {
	const clean = text.replace(/\s+/g, "");
	const binary = atob(clean);
	const out = new Uint8Array(binary.length);
	for (const [index, char] of [...binary].entries()) {
		out[index] = char.charCodeAt(0);
	}
	return out;
};

/** Base64 encode, chunked so a large payload does not blow the call stack. */
export const base64Encode = (bytes: Uint8Array): string => {
	const CHUNK = 0x8000;
	let binary = "";
	for (let at = 0; at < bytes.length; at += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
	}
	return btoa(binary);
};
