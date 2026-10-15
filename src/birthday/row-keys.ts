const fingerprint = (input: string): string => {
	let hash = 0;
	for (let i = 0; i < input.length; i++) {
		hash = (hash << 5) - hash + input.charCodeAt(i);
		hash |= 0;
	}
	return (hash >>> 0).toString(36);
};

type RowIdentity = {
	name: string;
	birthdayString: string;
	kind: string;
};

type KeyedRow<T> = { record: T; key: string };

export const withRowKeys = <T extends RowIdentity>(
	list: readonly T[],
): KeyedRow<T>[] => {
	const seen = new Map<string, number>();
	return list.map((record) => {
		const base = fingerprint(
			`${record.name}\u001F${record.birthdayString}\u001F${record.kind}`,
		);
		const occurrence = seen.get(base) ?? 0;
		seen.set(base, occurrence + 1);
		return { record, key: `${base}#${occurrence}` };
	});
};
