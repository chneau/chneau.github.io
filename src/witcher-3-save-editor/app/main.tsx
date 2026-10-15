import type { MantineColorsTuple } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../../shared/tokens.css";
import "../../shared/base.css";
import { mountApp } from "../../shared/mountApp";
import { Home } from "./page";

const brand: MantineColorsTuple = [
	"#f1f4f3",
	"#e0e6e5",
	"#c4cfcd",
	"#9dafac",
	"#79908d",
	"#647875",
	"#51615f",
	"#414e4c",
	"#2f3736",
	"#1f2423",
];

mountApp({ analyticsId: "witcher-3-save-editor", brand, app: <Home /> });
