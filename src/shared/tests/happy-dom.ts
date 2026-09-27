import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register a DOM only for files that import this module (the a11y tests), so
// pure-logic suites keep running in Bun's normal environment.
if (typeof document === "undefined") {
	GlobalRegistrator.register();
}
