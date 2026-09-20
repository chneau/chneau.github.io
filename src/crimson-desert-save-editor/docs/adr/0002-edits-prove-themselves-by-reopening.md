# An edit proves itself by reopening its own output

Every applied edit goes through `openSave` / `commitSave`
(`lib/save-engine/transaction.ts`), which re-encrypts the payload and then
decodes the result again, refusing to return it unless the reopened payload is
byte-identical to what the edit wrote, and hashing the output for the audit
trail. The container is a port of an earlier Python editor, so a mistake in the
port would be invisible to inspection; proof at runtime is cheaper than
certainty by reading it. Features used to hand-roll this lifecycle, which is why
it now lives in one place no feature can skip.

Consequences: each edit pays a full encode and reopen of the whole save — about
26 ms for the `save.save` fixture and 59 ms for `endgame.save`
(`bun tests/benchmark.ts`, whose header calls that toll the one every fixture
test pays). A hundred staged items therefore costs seconds, which is why edits
are grouped and the loop yields between them.
