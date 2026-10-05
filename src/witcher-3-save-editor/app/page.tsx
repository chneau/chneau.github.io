import { SaveWorkbench } from "../../shared";
import { witcher3 } from "../lib/format";

/**
 * THE WITCHER 3: WILD HUNT save editor.
 *
 * The whole page is the shared workbench plus this game's codec, which is the
 * intended shape for every editor here: the parts that are hard — reading a
 * save, staging changes, rebuilding the container, proving the rebuild reads
 * back — are written once, and a game contributes its format and nothing else.
 *
 * Witcher 3 earns that more than most. Its save is a chunked LZ4 container
 * around a REDkit token stream with no checksum anywhere, so the interesting
 * work is all in `lib/`; the page itself has nothing game-specific left to do.
 */
export const Home = () => <SaveWorkbench codec={witcher3} />;
