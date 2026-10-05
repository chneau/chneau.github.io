ADR-0007 — only the width-preserving edits are offered
========================================================

The `src/witcher-3-save-editor` codec writes to a save. That is a claim worth
stating precisely, because "it can edit a save" and "it can edit *any* value in
a save" are very different promises, and only the first is true.

**The decision.** Every edit the editor offers writes a value whose **width does
not change** — a `u16` overwritten with a `u16`, an `Int32` with an `Int32`. No
edit adds, removes, or resizes anything. Anything that would change a length is
absent from the editor entirely, rather than present and disabled.

**Why this is the whole basis of the writer.** A `.sav` carries no checksum over
its contents: not in the `SNFH`/`FZLC` header, not in the `SAV3` stream, not in
the `SE` footer. The only CRC in the game belongs to the `POTATO70` asset
*bundle* format, which is a different file. So nothing has to be recomputed over
a modified payload, which removes the hazard that usually makes a save editor
dangerous.

What remains is bookkeeping, and it is confined. Every offset that can shift
lives in the 3084-byte container header: a patched block compresses to a
different size, so each subsequent chunk's `endOffset` moves, and `endOffset` is
the only *absolute file offset* in the format. The `SAV3` header, the `SE`
footer, the `SC` span index and the variable table all address the
**decompressed** stream, whose length a width-preserving edit leaves alone. So
the rebuild is 3084 bytes of bookkeeping and nothing more.

Measured on all seven reference saves: patching money, level and both point
counters changes between 4 and 7 bytes of a payload of 1,039,268 to 15,490,509
bytes, the rebuilt container re-parses, and every value reads back correctly.

**What it rules out, and why that is not fixable by effort.** Changing a length
means rewriting the `AVAL` length field, the enclosing `BLCK`/`SS` frame sizes,
the `SC` span index (up to 79,339 entries) and the variable table (6,864
entries) — whose coordinate base the decoder's own notes record as *not fully
understood*: residuals spread across roughly `[2960, 3130]` and `field1` is not
`absoluteEnd + const`. Separately, the decompressed stream is only about 72–77%
token-walked, so a full encoder would be writing bytes it cannot parse. Adding
a skill or renaming a string is therefore out of reach, and no amount of care in
this repository changes that.

**Amended once, and the amendment matters.** This paragraph originally also listed
"adding an inventory item", and that turned out to be reachable by a narrower
route than the general one: an item record is a *self-contained 30-byte unit* in a
list whose header declares its own length, so appending one grows a known span
rather than requiring the whole stream to be understood. `lib/add-item.ts` does
it, and `lib/max-mutations.ts` inserts absent struct members for the same reason.
The claim was not wrong about the difficulty — it was wrong about which
operations the difficulty applies to, and it was never re-examined against the
code that had since been written. See the consequences below.

**Consequences, accepted.**

- The editor's *default* edits are **width-preserving stat edits**: money, level,
  difficulty, skill points, experience, and per-item quantities.
- **Two operations are resizes, and this ADR does not govern them.** `add-item`
  appends a whole record and `max-mutations` inserts absent `*Used` fields; both
  therefore grow the decompressed stream and rewrite the `SC` span index and the
  footer's variable-table offset — see `lib/add-item.ts` and `lib/max-mutations.ts`,
  each of which carries its own measured evidence in its header. They were added
  after this ADR and should be read as the narrow exceptions to the rule above.
  "Adding a skill or an item is out of reach" was true when this was written and
  is **no longer true for an item**; it remains true for a skill, which would need
  a new `MANU` name *and* an array element in a stream this codec cannot fully
  walk.
- The compressed size of a rebuilt save differs from the original even with no
  edits, because LZ4 admits many valid encodings and this compressor makes no
  attempt to match the game's. So an unedited save round-trips as `semantic`,
  never `identical`. This is why the document deliberately does **not** expose
  the file's compressed size: a field that moves on every rebuild is precisely
  what the workbench's round-trip check reads as an unsound file.
- Whether the game *loads* a rebuilt save is not established here. Every rebuilt
  file is decoded again and its values compared before download, which proves
  self-consistency and that the edits landed. Only launching the game settles
  the rest.

**What would reverse it.** A decoder that walks the stream exhaustively, plus a
determined answer to the variable table's coordinate base. At that point a real
token-stream encoder becomes possible and this ADR should be replaced rather
than amended.