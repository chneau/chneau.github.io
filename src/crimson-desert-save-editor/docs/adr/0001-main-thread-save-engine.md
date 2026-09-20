# The save engine runs on the page's main thread

The engine decodes, edits and re-encrypts a save directly in the page, with no
Web Worker and no second bundle — the session's event stream is the one a worker
used to post, which `lib/save-engine/session.ts` still says in as many words.
Batches of edits run for minutes, so the apply loop hands the thread back
through a `setTimeout` macrotask: once per run, and once per finished edit
inside a run that applies edits one at a time. That is what lets the progress
bar repaint instead of the browser offering to kill the tab.

Considered options: keeping the engine in a worker and relaying its events. The
engine's only consumer is the page it already runs in, so a worker would add a
second entry point and a structured-clone copy of a multi-megabyte payload in
each direction, to buy responsiveness the yield already provides.
