import type { Bytes } from "./bytes";

export const pbkdf2Sha1 = async (
	password: string,
	salt: Bytes,
	iterations: number,
	keyLength: number,
): Promise<Bytes> => {
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

export const xorBytes = (bytes: Bytes, key: number): Bytes => {
	const out = new Uint8Array(bytes.length);
	for (const [index, byte] of bytes.entries()) out[index] = byte ^ key;
	return out;
};

export const base64Decode = (text: string): Bytes => {
	const clean = text.replace(/\s+/g, "");
	const binary = atob(clean);
	const out = new Uint8Array(binary.length);
	for (const [index, char] of [...binary].entries()) {
		out[index] = char.charCodeAt(0);
	}
	return out;
};

export const base64Encode = (bytes: Uint8Array): string => {
	const CHUNK = 0x8000;
	let binary = "";
	for (let at = 0; at < bytes.length; at += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
	}
	return btoa(binary);
};
