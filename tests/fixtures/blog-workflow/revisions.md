# Critique and revisions

The review checked whether `hiddenFromList` or the `e2e-` prefix could provide isolation. Neither excludes a post from the actual article routes. The draft names `draft: true` as the route boundary and remains outside `src/content/posts`.

The translation section distinguishes native `sourceHash` from the full artifact digest. Native hash parity does not prove translation quality, and an evidence JSON entry is a reviewer's attestation, not proof that a browser ran.

The English twin was manually aligned with the Russian fixture, then protected with `manuallyEdited: true`. Its sourceHash is generated using the repository's `contentHash` function after synchronization. No paid translation was used.

This is an implementation self-review. An independent agent review and real native rendering are separate steps; they are not implied by this note. No completed visual review is bundled into the fixture.
