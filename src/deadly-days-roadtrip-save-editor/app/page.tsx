import { SaveWorkbench } from "../../shared";
import { deadlyDays } from "../lib/format";

/**
 * Deadly Days: Roadtrip save editor.
 *
 * The whole page is the shared workbench plus this game's codec, which is the
 * intended shape for every editor on this site: the parts that are hard —
 * reading a GVAS container, decoding the property stream inside it, staging a
 * change, rebuilding, and proving the rebuild reads back — are written once, and
 * a game contributes its format and nothing else.
 */
export const Home = () => <SaveWorkbench codec={deadlyDays} />;
