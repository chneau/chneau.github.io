# Editing happens entirely in the user's browser

The app has no upload or processing endpoint: the save is read with the File
API, edited in the page, and downloaded as a new file, so a user's save only
ever exists on their own machine. The published app is a static bundle served
straight from GitHub Pages: it ships the page plus the two static picture
archives and nothing else, and the page's only network request is the
same-origin GET for those picture parts (`lib/image-archive.ts`) — no save byte
is sent anywhere. Uploading saves for server-side processing would be simpler to
instrument, but it would make save files a liability to hold, and the format's
own crypto is available as WebCrypto in the page anyway.

Constraints that follow from this: nothing may grow the served assets past the
hosted static-asset per-file limit of 25 MiB — the pictures ship as two prebuilt
ZIP parts of about 16 MB each under `assets/image-archive/` for exactly that
reason (`lib/image-archive.ts`) — and features must work with no server state at
all.
