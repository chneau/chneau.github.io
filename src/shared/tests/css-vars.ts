type Usage = {
	token: string;
	file: string;
	hasFallback: boolean;
};

const TOKEN_NAME = /^--[a-zA-Z0-9_-]+/;

const matchingParen = (source: string, open: number): number => {
	let depth = 0;
	for (let i = open + 1; i < source.length; i += 1) {
		if (source[i] === "(") depth += 1;
		else if (source[i] === ")") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
};

const scan = (
	text: string,
	file: string,
	inheritedFallback: boolean,
	found: Usage[],
): void => {
	for (let i = 0; i < text.length; i += 1) {
		if (!text.startsWith("var(", i)) continue;

		const close = matchingParen(text, i);
		const body = text.slice(i + 4, close === -1 ? text.length : close);

		const name = body.trimStart().match(TOKEN_NAME)?.[0];
		const ownFallback = /,\s*\S/.test(body);
		if (name !== undefined) {
			found.push({
				token: name,
				file,
				hasFallback: ownFallback || inheritedFallback,
			});
		}

		scan(body, file, ownFallback || inheritedFallback, found);

		if (close === -1) return;
		i = close;
	}
};

export const collectUsages = (source: string, file: string): Usage[] => {
	const found: Usage[] = [];
	scan(source, file, false, found);
	return found;
};
