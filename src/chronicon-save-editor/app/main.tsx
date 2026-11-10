import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

const brand: MantineColorsTuple = [
	"#fdf7e3",
	"#f8ecbf",
	"#eed98a",
	"#e3c252",
	"#d9ae2b",
	"#c99a14",
	"#a87f0c",
	"#856509",
	"#644c07",
	"#443305",
];

mountApp({
	analyticsId: "chronicon-save-editor",
	brand,
	app: <Home />,
});
