# Fit photo capture — single button (iOS), two-button deferred to Android

## Context

PR #6 (`48d307d`) split the fitting-mode photo button into **Upload Photo** (plain
`accept="image/*"` input) + **Take Photo** (`capture="environment"`), plus a
reusable `createPhotoSource` helper, to guarantee a camera path across platforms.

On-device testing (iPhone/iPad) then showed that the **plain input alone** already
opens iOS's native action sheet — Photo Library / Take Photo / Choose File / Drive.
On iOS the second button is therefore redundant: one plain input covers camera,
gallery, and files. (The original "only opens camera, no upload" report was almost
certainly a stale PWA service-worker cache, not the markup — the shipped-first
single button used the same plain input.)

## Decision

**Target iOS/iPadOS for now with a single button.** Revert PR #6 so fitting mode
uses one `Take / Upload Photo` button backed by a plain `accept="image/*"` input.

Android is **not** covered by this decision. On Android a plain input is not
guaranteed to offer a camera option (varies by OEM browser/version), so the
`capture="environment"` button is the reliable way to guarantee camera access
there. That work is deferred until Android can actually be tested (real device or
Android Studio AVD — Chrome DevTools "device mode" does **not** emulate the OS file
picker or camera, so it can't validate this).

## Android follow-up (when picked up)

The full two-button implementation — `bike/src/ui/photoSource.ts`
(`createPhotoSource`), its jsdom test, the second capture input, and the
`fitGuide`/`main.ts` wiring — is preserved in git at commit **`48d307d`** ("split
fit photo into Upload + Take Photo buttons (#6)"). Recover it with
`git show 48d307d` / `git cherry-pick` rather than rewriting from scratch.
