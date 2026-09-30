# Fixture disclosure: the No Rest for the Wicked saves carry a Steam ID

Status: **Proposed — needs a decision before this is published**

## Context

The byte-exactness claim on this app rests on eleven committed `.dat` files,
each of which is a real save from one Steam account. They contain:

- **Steam ID `76561198016420457`**, in the `accountId` field of every file, and
  in both `id` and `name` of the `Account_*.dat` files. This is a permanently
  identifying, non-rotatable account identifier which resolves to a live Steam
  profile.
- The character name `Charles`, realm names, character GUIDs, and playtime.
- A real playthrough's progression: equipment, gold, quest and world flags.

The same files are already committed to `github.com/chneau/testing`, so the
exposure is not new. It is however now proposed for a _public page_, and
deleting a commit later does not un-expose a Steam ID.

Redaction is not available. The envelope can be rewritten, but the CERIMAL
payload is a base64 blob this app does not re-serialise from a document — it
replays the original bytes — so a rewrite of the envelope cannot remove whatever
the binary payload also contains. Redacting properly would mean writing a
CERIMAL writer, which does not exist.

## Decision so far

No fixture is shipped in the app directory yet. The suite that needs them lives
outside the repository, so the byte-exactness proof is observed locally and does
not run in CI. That is a real cost: the strongest claim this site makes about a
save format is currently unproven by `bun test` on a fresh clone.

## Options

1. **Get written permission from the save's owner**, then commit. Record the
   permission in this file and in the app README. Cheapest, and the only option
   that makes the proof permanent.
2. **Ship no fixtures.** The page starts empty and a user supplies their own
   save. Costs the "explorable before you have a save" property, and the
   byte-exactness suite keeps skipping in CI.
3. **Scrub and commit.** Requires a CERIMAL writer to rewrite the payload, which
   is a substantially larger piece of work than the editor itself.

## Consequences

Under option 2, `bun test src/no-rest-for-the-wicked-save-editor` in CI
exercises only the synthetic cases. Any future contributor reading a green run
must know that the eleven-file byte-exactness proof is not part of it.

Note the contrast with ADR-0006 in the Crimson Desert app, which took the
opposite position — that app's fixtures are committed, and they are 4.2 MB
against these at 8.4 MB. The deciding factor is not size but what the bytes
contain, and these contain a live account identifier.

## What would reverse this

Written permission, or a synthetic fixture produced by a CERIMAL writer, either
of which makes the commit safe and the suite always-on.
