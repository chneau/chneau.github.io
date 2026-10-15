export const yieldToBrowser = (): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
