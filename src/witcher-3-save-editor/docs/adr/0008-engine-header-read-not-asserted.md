# The inner header is read, reported, and validated by magic only

A `.sav` is an `SNFH`/`FZLC` container, but that container is also the game's
general compressed-file envelope: a file can inflate cleanly and still hold
something that is not a save. The codec already displayed a `saveVersion`
string, but it built it by probing the first four bytes and returned
`"unknown"` when they were wrong, and `decode` went on to walk the token stream
regardless. That is a document assembled from unrelated bytes rather than an
error.

**The decision.** `readHeader` (`lib/inner.ts`) reads the four-byte `SAV3`
magic and the three `u32` values after it, returns them as a typed
`InnerHeader`, and throws for anything that is not a `SAV3` stream.
`readSaveVersion` keeps its string contract (`"66/29/164"`) by delegating to
`readHeader`; `decode` calls `readHeader` before the token walk, so a valid
container that is not a save is refused by name. The engine's legacy `SAVY`
magic is refused with its own message.

**What the executable does.** On build 5.0.1048522 the writer at `0x1423787c7`
emits `SAV3`, then `0x43` (67), `0x1d` (29), `0xa4` (164). The committed
fixtures from an earlier build carry `0x42` (66), 29, 164 — the first value
moves with the build. The loader at `0x1423799f0` accepts `SAV3` and `SAVY`,
reads the first value as the save version and hands it to the stream reader. A
second loader path at `0x142378970` rejects a version at or above `0x44` (68)
and a third value at or above `0xa5` (165), but that is one path, not the only
way a save is read, so its limits are evidence about the format rather than a
check this editor should impose on every file.

**Why not a hard version check.** The three values are version fields: the
build that wrote the fixture and the build that wrote the installed executable
already disagree on the first. A browser editor that pinned the values it has
fixtures for would refuse the next patch's save while the game loads it, and
the token grammar has not changed across the two headers this codec has been
run against. Reporting the values lets a user see what they opened; rejecting
a version would be a claim the evidence does not support.

**Why `SAVY` is refused.** The engine treats `SAVY` as a legacy stream behind
the same container, with a different loader path. This codec implements the
`SAV3` grammar; a legacy stream parsed with it would yield a document that is
wrong rather than absent, and a wrong document is the failure mode this
repository spends the most effort avoiding. The error names `SAVY` and the way
forward — save once in the current game version — rather than reporting a
corrupt save.

**Consequences, accepted.**

- `decode` now rejects a valid `SNFH` container whose payload is not a `SAV3`
  stream, including the game's other compressed files. That is the intended
  behaviour: the alternative is a document built from unrelated bytes.
- The document still carries the version as the string the page already
  displayed; the header is not duplicated into a second structured field.
- A future `SAV3` save with a larger version still decodes. If its token
  grammar changes, the failure appears in the token walk with a real symptom
  rather than being pre-empted by a version check that guessed.
- A genuine `SAVY` save is not editable here, and the editor says so instead
  of offering fields found at coincidental offsets.

**What would reverse it.** A `SAVY` decoder, or evidence that a `SAV3` version
above 67 changed the token grammar. Either would be a change to the grammar
layer, not to this check; the header would still be read and reported.
