/**
 * No Rest for the Wicked save editor.
 *
 * The whole page is the shared workbench plus this game's codec. That is the
 * intended shape for every editor here: the parts that are hard — reading a
 * save, staging changes, rebuilding, proving the rebuild is sound — are written
 * once, and a game contributes its format and nothing else.
 */
import { SaveWorkbench } from "../../shared";
import { noRestForTheWicked } from "../lib/format";

export const Home = () => <SaveWorkbench codec={noRestForTheWicked} />;
