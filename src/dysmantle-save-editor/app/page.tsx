import { SaveWorkbench } from "../../shared";
import { dysmantle } from "../lib/format";

/**
 * DYSMANTLE save editor.
 *
 * The whole page is the shared workbench plus this game's codec, which is the
 * intended shape for every editor here: the parts that are hard — reading a
 * save, staging changes, rebuilding, proving the rebuild reads back — are
 * written once, and a game contributes its format and nothing else.
 */
export const Home = () => <SaveWorkbench codec={dysmantle} />;
