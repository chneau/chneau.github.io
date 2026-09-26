import { createTheme, type MantineColorsTuple } from "@mantine/core";

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

export const spoonersTheme = createTheme({
	primaryColor: "amber",
	primaryShade: { light: 5, dark: 4 },
	colors: { amber },
	defaultRadius: "md",
	fontFamily: '"Segoe UI Variable", "Segoe UI", Arial, sans-serif',
	fontFamilyMonospace: '"Cascadia Code", Consolas, monospace',
	headings: { fontFamily: 'Georgia, "Times New Roman", serif' },
});
