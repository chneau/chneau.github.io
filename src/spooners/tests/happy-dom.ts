import { GlobalRegistrator } from "@happy-dom/global-registrator";

// A DOM only for suites that need one, so pure-logic suites keep running in
// Bun's normal environment.
if (typeof document === "undefined") {
	GlobalRegistrator.register();
}
