import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

const brand: MantineColorsTuple = [
	"#f4f4e6",
	"#e4e3c9",
	"#c8c6a2",
	"#acaa7b",
	"#93915c",
	"#7f7d47",
	"#6d6b3b",
	"#5b592f",
	"#4a4826",
	"#3a381d",
];

mountApp({ analyticsId: "dysmantle-save-editor", brand, app: <Home /> });
