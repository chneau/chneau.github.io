import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

const brand: MantineColorsTuple = [
	"#f0edff",
	"#dcd5ff",
	"#bcb0f2",
	"#9b8ade",
	"#8471c8",
	"#6d5aa8",
	"#5c4a94",
	"#4b3b7a",
	"#3a2d60",
	"#2a2046",
];

mountApp({
	analyticsId: "librarian-save-editor",
	brand,
	app: <Home />,
});
