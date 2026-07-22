# Release flow

Production Stable and Beta releases are promotions of verified TestProduction
candidates. They are not created by manually pushing a Production tag.

## One-time GitHub environment setup

Create these environments in the source repository under
**Settings → Environments**:

- `production-candidate-approval`: approves a Staging candidate for Production Draft creation.
- `production-release`: approves publishing the verified Draft to users.

Add at least one required reviewer to both environments. The workflows fail
closed when a required-reviewer rule is missing. If more than one maintainer is
available, enable **Prevent self-review** and disable administrator bypass.

Environment approvals wait for at most 30 days. Reject an obsolete candidate
instead of leaving it pending indefinitely.

## Stable release

Prepare the intended Production version in `package.json` and commit it before
creating the RC. A synthetic Staging version remains useful for update tests,
but it is deliberately not promotable.

Run **TestProduction Candidate**:

```text
source_ref: main or an exact commit SHA
target_version: 1.2.3
attempt: 1
```

This publishes `1.2.3-rc.1` to TestProduction. After the candidate is tested:

1. Open the automatically queued **Approve Production Candidate** run.
2. Verify the job title says `Draft 1.2.3 from 1.2.3-rc.1` and follow its
   environment link to the exact TestProduction release.
3. Approve `production-candidate-approval`.
4. The workflow revalidates the latest Stable candidate, source commit,
   `package.json`, signature, update metadata, and assets. It creates only a
   Draft `v1.2.3`; the updater cannot see it.
5. Inspect the Draft and open the automatically queued **Publish Production Draft**
   run.
6. Verify the Production target, RC, source SHA, and Draft link again, then
   approve `production-release`.
7. The workflow downloads the Draft again, verifies SHA-256 checksums and the
   signed app from the ZIP, then publishes `v1.2.3` as the latest release.

The Production app is rebuilt from the RC's exact source commit because
Staging and Production use different bundle identifiers and update providers.
The Staging binary itself is never copied into Production.

### Candidate safety rules

- Attempts for one target must be monotonic: `rc.1`, `rc.2`, `rc.3`.
- Only the highest published attempt for the exact target can be promoted.
- A newer attempt cancels the older pending candidate-approval run.
- Every approval rechecks that the candidate has not been superseded.
- A first approval creates a Draft only; a different environment approval is
  required to publish it.
- A new approved RC may replace an unpublished Draft for the same Production
  version. Published releases are never replaced.
- Direct Production tags do not publish assets; the promotion workflow creates
  the tag only after the verified Draft is approved.

GitHub represents candidate state without a mutable custom status file:

```text
testing     = current TestProduction candidate with a pending approval
rejected    = candidate environment approval was rejected
superseded  = a newer TestProduction attempt for the same target exists
approved    = a verified Production Draft exists
promoted    = the Production Draft was published
```

If the wrong candidate was approved at the first gate, do not approve the final
publish job. Publish and test the next attempt; approving it replaces the old,
unpublished Draft after the new build has passed verification.

## Production Beta

Set `package.json` to the intended Beta version and commit it. Then run
**TestProduction Candidate** without creating a Production tag:

```text
source_ref: main or an exact commit SHA
target_version: 1.2.3-beta.1
attempt: 1
```

This produces `1.2.3-beta.1.staging.1`. If it fails testing, keep the same
target and publish attempt `2`, `3`, and so on. Only the highest attempt for
that exact Beta target can pass approval.

After testing, use the same **Approve Production Candidate** and **Publish
Production Draft** approvals. The approved source is rebuilt as Production
`1.2.3-beta.1`, with `beta-mac.yml`, GitHub prerelease status, and tag
`v1.2.3-beta.1`. The `.staging.N` suffix never enters the Production version.

## Version rule

Promotable Stable candidate:

```text
package.json:             1.2.3
TestProduction candidate: 1.2.3-rc.2
Production release:       1.2.3
```

Production Beta:

```text
package.json:             1.2.3-beta.2
TestProduction candidate: 1.2.3-beta.2.staging.3
Production release:       1.2.3-beta.2
```
