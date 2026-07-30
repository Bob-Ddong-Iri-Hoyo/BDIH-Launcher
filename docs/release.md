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
promoted_from_beta_tag: v1.2.3-beta.2.staging.3+staging.beta
```

The selected Beta source commit must be an ancestor of `source_ref`, and both
must belong to the `1.2.3` version line. The workflow records the complete Beta
metadata in the Stable RC and shows every changed file since that Beta in the
run summary. This publishes `1.2.3-rc.1` to TestProduction. After the candidate
is tested:

1. Open the automatically queued **Production Release** run.
2. Verify the job title says `Draft 1.2.3 from 1.2.3-rc.1` and follow its
   environment link to the exact TestProduction release.
3. Approve `production-candidate-approval`.
4. The workflow revalidates the latest Stable candidate, source commit,
   `package.json`, signature, update metadata, and assets. It creates only a
   Draft `v1.2.3`; the updater cannot see it.
5. Inspect the Draft and the final publish job waiting in the same
   **Production Release** run.
6. Verify the Production target, RC, source SHA, and Draft link again, then
   approve `production-release`.
7. The workflow downloads the Draft again, verifies SHA-256 checksums and the
   signed app from the ZIP, then publishes `v1.2.3` as the latest release.

The Production app is rebuilt from the RC's exact source commit because
Staging and Production use different bundle identifiers and update providers.
The Staging binary itself is never copied into Production.

### How to use the two approval gates

A promotable TestProduction candidate starts **Production Release**
automatically through `repository_dispatch`. The same workflow also has a
manual `Run workflow` form that accepts an existing candidate tag. Use the
manual form only to requeue a current candidate after a transient failure; it
never rebuilds or mutates the TestProduction candidate.

For the first approval:

1. Open **Actions → Production Release** after the Staging build.
2. Open the run whose title contains the exact target, candidate, and channel.
3. Follow the Environment link to the TestProduction release and inspect its
   source SHA. For Stable, inspect the Beta parent and the Beta→RC file diff.
4. Click **Review deployments**, select `production-candidate-approval`, enter
   a comment if needed, and choose **Approve and deploy**.
5. This builds and verifies Production assets but creates only an unpublished
   Draft.

For the final approval:

1. It appears as the next waiting job in the same run after the Draft is created.
2. Use its Environment link to inspect the exact Draft,
   candidate, channel, source SHA, and assets.
3. Click **Review deployments**, select `production-release`, then choose
   **Approve and deploy**.
4. The job re-downloads and verifies the Draft before making it public.

Reject the deployment instead of approving it when the candidate is wrong. A
newer attempt cancels or supersedes the older pending run. If **Prevent
self-review** is enabled, the person who triggered the workflow cannot approve
it; use another required reviewer.

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

Do not use **Re-run jobs** to apply a workflow fix to an existing candidate:
GitHub reruns the workflow stored at that candidate's original source commit.
The manual **Production Release** form can requeue a current candidate only
when its source contains the same `.github/workflows` state as current `main`.
If promotion policy changed, push the fix and create the next TestProduction
attempt. The same attempt number becomes reusable only if both the Release and
tag are intentionally deleted.

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

Keep `package.json` at the release train version, such as `1.2.3`. The workflow
injects the selected Beta version only into the packaged Staging and Production
apps, so no Beta-only version commit is required. Run **TestProduction
Candidate** without creating a Production tag:

```text
source_ref: main or an exact commit SHA
target_version: 1.2.3-beta.1
attempt: 1
promoted_from_beta_tag: leave empty
```

This produces `1.2.3-beta.1.staging.1`. If it fails testing, keep the same
target and publish attempt `2`, `3`, and so on. Only the highest attempt for
that exact Beta target can pass approval.

After testing, use the same two **Production Release** approval gates. The
approved source is rebuilt as Production
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
package.json:             1.2.3
TestProduction candidate: 1.2.3-beta.2.staging.3
Production release:       1.2.3-beta.2
```

`package.json` defines the release train, not the channel build. A `1.2.3`
source may produce `1.2.3-beta.N`, `1.2.3-rc.N`, and final `1.2.3`, but it
cannot produce a `1.2.4` or `1.3.0` target.
