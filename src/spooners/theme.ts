import type { MantineColorsTuple } from "@mantine/core";
import { createAppTheme } from "../shared";

/** Warm amber, in keeping with a decent pint. */
const amber: MantineColorsTuple = [
	"#fff8e1",
	"#ffecb3",
	"#ffdf80",
	"#ffd24d",
	"#ffc61a",
	"#e6ad00",
	"#b38600",
	"#805f00",
	"#4d3900",
	"#1a1300",
];

export const spoonersTheme = createAppTheme({
	accent: amber,
	accentName: "amber",
	primaryShade: { light: 5, dark: 4 },
});
