export const hostedIcsUrl = (origin: string): string =>
	new URL("/birthdays.ics", origin).href;

export const toWebcal = (httpsUrl: string): string =>
	httpsUrl.replace(/^https:/i, "webcal:");
