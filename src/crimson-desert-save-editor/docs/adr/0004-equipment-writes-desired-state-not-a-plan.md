# An equipment edit writes a desired state, not a plan of operations

Equipment edits used to be lowered twice: the typed edit became a
`{schema_version, operations}` plan, and a second dispatcher
(`lib/save-engine/safe-edit-engine.ts`) re-validated that plan at runtime before
handing each operation to an applier. Only `browser-equipment.ts` ever spoke the
schema, four of its seven operation types had no caller at all, its `donors` and
`catalog` options were never passed, and the rebuild and quantity operations
were unreachable because the edits that needed them already called their
appliers directly. The seam had been designed for callers that never arrived,
and it contradicted the one-dispatch-point rule, so it is deleted.

That work now goes through `setEquipment(source, target, desired)` in
`lib/save-engine/equipment-editor.ts`: refinement, unlocked Socket count and
Socket contents are each written by the applier that owns that field's guards
(refinement levels, Socket Caps, Abyss Gear compatibility), but they share a
single decode, commit and reopen, and the audit reports the appliers' own fields
rather than a plan wrapper. The field appliers stay exported and directly
tested; each is now a raw-payload transform plus a thin byte-level wrapper,
which is the seam that lets several fields compose inside one transaction.

_Considered:_ keeping the plan schema as a contract for tooling outside this
repo — nothing here or elsewhere speaks it, and a CLI that needs one is a
deliberate seam to add back rather than one to keep on spec. _Considered:_
having the browser adapter call the four field appliers in a loop, the smallest
possible deletion — rejected because every applier pays its own decode, encode
and reopen, so a six-field edit would encode the save six times. Measured on
`endgame.save`, the shared write costs 237 ms for one field and 284 ms for two;
a loop would have charged roughly double for the second.
