import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

const brand: MantineColorsTuple = [
	"#fff9e0",
	"#fdefb8",
	"#f8e071",
	"#f3d13a",
	"#efc612",
	"#e3ad00",
	"#c98f00",
	"#a97000",
	"#885300",
	"#6b3d00",
];

mountApp({ analyticsId: "cyberpunk-2077-save-editor", brand, app: <Home /> });
