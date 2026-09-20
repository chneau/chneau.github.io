# Save fixtures stay committed as plain blobs

`saves/save.save` (1.34 MB) and `saves/endgame.save` (2.98 MB) are read by four
test suites — engine, max-equipment, cheat-gear and staged-projection — and by
both benchmarks, and they are the only real saves the repository has. They are
committed as ordinary blobs rather than through Git LFS, fetched at test time,
or replaced by something smaller.

The cost is bounded and known, which is what makes it acceptable. Two blobs of
those files exist in the whole history: they were added in one commit
(`a355ba54`) and have never been modified since, so git's permanent cost is 4.31
MB and grows only if a fixture is replaced. They do not compress into the pack
at all — the payload is already LZ4-compressed and encrypted, and gzip -9 turns
2,980,322 bytes into 2,980,795 — so there is no cheaper representation git could
pick. Against the project's own 51 MB of tracked files they are 8% of it, and
the two picture archives under `assets/image-archive/` (33.5 MB) plus the
generated catalogs under `lib/generated/` (about 9.5 MB) are the fixtures that
would justify a different storage strategy first.

_Considered:_ Git LFS — it would move 4.31 MB out of a pack that already holds
234 MiB of this monorepo, in exchange for a `git lfs` step every clone, CI job
and contributor would have to run. This repository has no `.gitattributes`, no
LFS and no CI today, and a migration would rewrite history shared with the
monorepo's other projects, so it buys the least and costs the most. If LFS is
ever adopted here it should cover `assets/image-archive/*.zip` and the saves in
one rule, not the saves alone. _Considered:_ keeping only `endgame.save` — it is
the only save whose companion roster is at its cap, which is what the "endgame
saves list their roster but offer no additions" case rests on, and it is what
both benchmarks run against, so dropping either file trades real coverage for
1.3–3 MB. _Considered:_ generating a save in the tests, or downloading one — the
engine edits saves in place and has no writer that can produce one from nothing,
so a synthetic fixture would mean porting the game's whole save writer; and
fetching would put a network dependency inside a suite that is offline by design
and inside an app that never uploads a save (ADR-0003).

Consequences: a save fixture is append-only in practice. Replacing one in place
spends a fresh incompressible 1.3–3 MB blob in history forever, so a save is
added for a case that earns it rather than refreshed for a tweak, and two
fixtures cover one feature only when their difference is the point. The decision
to revisit is about size, not principle: a fixture in the tens of MB, a second
save needed per game build, or LFS arriving anyway for the picture archives.
