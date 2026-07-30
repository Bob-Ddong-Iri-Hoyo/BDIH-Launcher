# Publishing and macOS signing

BDIH Launcher currently uses one self-signed update identity for release,
prerelease, and Nightly builds. This provides a stable designated requirement
for Squirrel.Mac update continuity, but it is not an Apple Developer ID and does
not provide Gatekeeper trust or notarization.

## GitHub Actions secrets

Configure these repository secrets in the source repository that runs the
Staging, promotion, Beta, and Nightly workflows:

- `MACOS_SIGNING_P12_BASE64`: Base64 contents of
  `private/bdih-code-signing.p12`.
- `MACOS_SIGNING_P12_PASSWORD`: The exact password used to export the `.p12`.
- `STAGING_RELEASE_TOKEN`: Fine-grained GitHub token restricted to
  `Bob-Ddong-Iri-Hoyo/BDIH-Launcher-TestProduction` with repository Contents
  read/write access. This is used only by `staging.yml`.

Generate a new identity only once:

```bash
./scripts/createP12.sh --copy-base64
```

To convert an existing `.p12` to the legacy PKCS#12 algorithms understood by
macOS without changing the certificate or private key:

```bash
./scripts/createP12.sh --reexport-p12 --copy-base64
```

The CI setup action also performs this compatibility conversion on its
temporary copy, so an existing valid Base64 secret does not have to be replaced
only for that reason.

Never commit `private/`, the `.p12`, the PEM private key, its Base64 form, or the
password. `private/` is ignored by Git.

## Protected Production environments

Create `production-candidate-approval` and `production-release` under GitHub
**Settings → Environments**. Add at least one required reviewer to both. The
workflows query the environment configuration and fail without a required
reviewer, even if an unprotected environment would otherwise start the job.

The first environment permits creation of an unpublished Production Draft. The
second permits publishing the already-built and independently reverified Draft.
Use separate approvals so selecting the wrong RC cannot immediately expose it
to the update feed. With multiple maintainers, enable prevention of self-review
and disable administrator bypass.

## Workflow behavior

The publishing workflows install the identity in a temporary Keychain, require
electron-builder to code-sign with `BDIH Launcher Update Signing`, verify the
packaged `.app`, and then remove the Keychain and temporary trust entry. Missing
or invalid secrets fail the build instead of falling back to ad-hoc signing.

The signing setup warns when 730 or fewer validity days remain and blocks
publishing below 180 days. A separate monthly workflow creates or updates a
persistent GitHub Issue during the two-year rotation window, assigns it to the
repository owner when possible, and remains failed until a replacement
certificate with sufficient validity is configured. This prevents expiry from
being visible only as an easy-to-miss log line.

Stable and beta use the normal application bundle identifier. Nightly uses its
separate Nightly bundle identifier, but all channels use the same signing
certificate.

Staging Stable/Beta candidates use `day.faby.bdih-launcher.staging`, the
`BDIH Launcher Staging` product name, and isolated settings and application
data. The staging app reads updates only from
`Bob-Ddong-Iri-Hoyo/BDIH-Launcher-TestProduction`; it does not replace or read
the installed Production or Nightly app.

## TestProduction staging candidates

Run **TestProduction Candidate** manually from GitHub Actions and provide:

- `source_ref`: the exact branch, tag, or commit SHA to test.
- `target_version`: `1.0.0` for a Production Stable target or
  `1.0.0-beta.1` for a Production Beta target.
- `attempt`: a positive candidate attempt number such as `1` or `2`.
- `promoted_from_beta_tag`: leave empty for Beta. For Stable, enter the exact
  tested Beta staging tag that becomes the RC's source baseline.

The workflow derives the update channel from `target_version`; there is no
separate channel choice to enter incorrectly. A plain target becomes a Stable
RC, while a Beta target becomes a Beta staging attempt:

`RC` means **Release Candidate**. The Beta candidate suffix deliberately uses
the full word `staging` instead of a project-specific abbreviation.

```text
target_version=1.0.0, attempt=2
promoted_from_beta_tag=v1.0.0-beta.2.staging.3+staging.beta
-> stable channel, version 1.0.0-rc.2

target_version=1.0.0-beta.1, attempt=2
promoted_from_beta_tag=
-> beta channel, version 1.0.0-beta.1.staging.2
```

The workflow builds and verifies the signed app before publishing. It then
updates the target repository's `staging` anchor branch and uploads the DMG,
ZIP, update metadata, blockmaps, and source metadata as a GitHub Release. The
target artifact names intentionally omit the architecture because staging is
currently arm64-only:

```text
BDIH-Launcher-Staging-Stable-1.0.0-rc.2.dmg
BDIH-Launcher-Staging-Stable-1.0.0-rc.2.zip
BDIH-Launcher-Staging-Beta-1.0.0-beta.1.staging.2.dmg
BDIH-Launcher-Staging-Beta-1.0.0-beta.1.staging.2.zip
```

The TestProduction Git tags also identify the channel while remaining valid
SemVer so electron-updater can still resolve prerelease channels correctly:

```text
v1.0.0-rc.2+staging.stable
v1.0.0-beta.1.staging.2+staging.beta
```

All target tags are immutable. If a candidate needs a code change, publish the
next attempt instead of replacing the old tag:

```text
1.0.0-rc.1 -> 1.0.0-rc.2
1.0.0-beta.1.staging.1 -> 1.0.0-beta.1.staging.2
```

GitHub's **Re-run jobs** action uses the workflow definition from the original
source commit; it does not pick up a newer workflow from `main`. If an attempt
already published its TestProduction Release or tag, push the workflow fix and
start the next attempt. Reusing the same attempt is possible only after
deliberately deleting both that TestProduction Release and its Git tag, which
should be reserved for pre-release repository cleanup rather than normal
candidate iteration.

The workflow enforces the next attempt for the same target. `package.json`
stores the release train only: source `1.0.0` may produce `1.0.0-beta.N`,
`1.0.0-rc.N`, or final `1.0.0`. A different train such as `1.1.0` is rejected.
The candidate version is injected into the Staging package, and its target
version is injected again when the exact source commit is rebuilt for
Production. After a promotable candidate is published, `repository_dispatch`
starts **Production Release** automatically; no Production version or tag is
entered again. The same workflow can be started manually with an existing
candidate tag to recover from a transient failure without rebuilding the
immutable TestProduction candidate.

A Stable RC additionally embeds the complete selected Beta candidate metadata.
The Staging workflow rejects a Beta from another final-version line, a
superseded attempt for that Beta target, or a Stable source commit that does not
descend from the Beta source commit. The candidate and final publication gates
download the Beta metadata again, verify the lineage, and show the Beta and RC
source SHAs. Source changes after Beta are allowed because release metadata or
fixes may be necessary, but the file diff is displayed and the Stable RC must
be tested again.

The candidate approval job accepts only the highest published attempt for the
exact Stable or Beta target. It rebuilds the exact candidate source with the
Production identity, verifies its signature and channel update metadata,
records SHA-256 checksums in `promotion-source.json`, and creates a Draft.
The next job in the same run calls the reusable Production publish gate and
waits on the separate `production-release` environment. It downloads
everything again, confirms the candidate is still current, checks provenance,
checksums, tag target, and the signed app from the ZIP, then publishes the
Draft using the candidate channel.

A manually requeued candidate must contain the same `.github/workflows` tree
as current `main`. GitHub cannot use the workflow `GITHUB_TOKEN` to create a
release targeting an older commit whose workflow files differ from the default
branch. After a promotion-workflow fix, publish the next TestProduction attempt
from current `main` instead of requeueing the older candidate.

A newer attempt cancels the older pending candidate-selection run for the same
target. If an old Draft exists for that target, approving the newer attempt
replaces only that unpublished Draft after the replacement build passes
verification. A published Production release is never replaced.

Stable staging candidates use the `latest` update metadata and normal GitHub
Release status. Beta candidates use `beta` metadata and GitHub prerelease
status. The channel derived from `target_version` becomes the first-run default,
but the Staging app keeps the same bundle identifier and allows switching
between Stable and Beta in Settings just like Production. Generated update
metadata for both channels lets Beta candidates update to later Beta candidates
or a final Stable candidate. The TestProduction repository must remain public
because packaged clients cannot safely contain a private-repository access
token.

When Stable switches to Beta, the app records that exact Stable version as its
return target. A later Stable return reads update metadata directly from that
version's GitHub release instead of following the newest `latest` release. Do
not delete the Stable release's `latest-mac.yml`, ZIP, or ZIP blockmap while a
Beta build may still need to return to it. Production uses tag `v<version>`;
Staging Stable uses `v<rc-version>+staging.stable`.

The return check compares persisted schema versions with the compatibility
contract compiled into the Stable build. Release authors do not maintain a
separate Stable/Beta compatibility matrix. Schema-changing code must bump the
corresponding constant in `src/Common/Constant/DataSchema.ts`; user choices such
as Wine/DXMT versions are data, not schema versions, and remain untouched during
the normal return.

App-data retirement is also channel-aware. Stable-to-Stable, Beta-to-Beta, and
Nightly-to-Nightly version changes may remove only explicitly registered
BDIH-owned legacy paths. Stable-to-Beta and Beta-to-Stable preserve retired
paths even when the destination build no longer reads them. Do not implement
cleanup by deleting unknown files. The authoritative matrix and retirement
rules are maintained in [App-data lifecycle and channel-safe cleanup](data-lifecycle.md).

For the first Production version there is no real predecessor. The staging
workflow permits a synthetic target from another release train for update
testing, but it does not queue Production approval. Both real Stable and Beta
candidates for the `1.0.0` train require `package.json: 1.0.0`. The approved
Staging source is rebuilt as Production with the target version injected and
without the `rc.N` or `staging.N` candidate suffix. Production and Staging use
different bundle identifiers and update repositories, so the Staging app does
not update directly into the Production app.

The first certificate-signed build cannot update an installation made with the
old per-build ad-hoc signature. Install that first signed build manually once;
later builds signed with the same `.p12` can validate update continuity.

## Certificate renewal

Do not use `--force` to renew a certificate that has already signed a public
build. A replacement certificate has a different fingerprint, even when its
subject name is the same, so switching GitHub Secrets immediately can make
Squirrel.Mac reject the update.

Renewal is deliberately split into preparation, bridge publication, and
activation. Start while more than 180 validity days remain. The monthly monitor
opens an Issue at 730 days so there is time to update every channel.

### 1. Prepare the replacement

Run:

```bash
./scripts/createP12.sh --prepare-renewal
```

The script asks for the current `.p12` password and a new replacement password.
It verifies the current identity, generates a new private key, certificate, and
`.p12`, and prints a renewal id such as:

```text
renewal-20350101T000000Z-0123456789AB
```

Secret replacement material is written under:

```text
private/renewal/<renewal-id>/
```

This directory remains ignored by Git. Public transition metadata is written
under:

```text
build/signing/bridge/<renewal-id>/
build/signing/bridge/active.json
```

The public files contain only certificate fingerprints, expiry metadata, and
stable/Nightly designated requirements. Commit those public files. Do not
update either GitHub signing Secret yet.

When `active.json` is present, `electron-builder.config.cjs` automatically
selects the stable requirement for stable and beta and the Nightly requirement
for Nightly. Each requirement accepts an app signed by either the old or the
replacement certificate while still requiring the correct bundle identifier.
The publish workflows also run `scripts/verifyMacosSigningBridge.sh` and fail if
the packaged app does not embed both fingerprints and the expected identifier.

### 2. Publish bridge releases with the old certificate

Keep these Secrets set to the old identity:

```text
MACOS_SIGNING_P12_BASE64
MACOS_SIGNING_P12_PASSWORD
```

Publish and test bridge releases for every update feed that can have installed
users:

1. Stable
2. Beta or any other active prerelease channel
3. Nightly

Verify all of these paths before activation:

```text
old stable  -> bridge stable
old beta    -> bridge beta
old Nightly -> bridge Nightly
```

The bridge build is still signed with the old certificate, so an existing app
accepts it. Its embedded designated requirement accepts both fingerprints, so
it can subsequently accept the replacement certificate. Users who never
install a bridge release may require a manual reinstall after activation.

Inspect a bridge build when needed:

```bash
codesign -dr - "/Applications/BDIH-Launcher.app"
codesign -dr - "/Applications/BDIH-Launcher Nightly.app"
```

The output must contain the old and replacement SHA-1 certificate hashes shown
by `--prepare-renewal`.

### 3. Activate only after bridge verification

After all channels have published and installed their bridge release, run:

```bash
./scripts/createP12.sh \
  --activate-renewal <renewal-id> \
  --confirm-bridge-release \
  --copy-base64
```

The acknowledgement flag is mandatory. Activation performs these operations:

- Verifies the replacement private key, certificate, `.p12`, and active bridge
  manifest all refer to the same identity.
- Archives the old local signing material under
  `private/archive/<renewal-id>-old-<fingerprint>/`.
- Promotes the prepared replacement files to `private/`.
- Removes `build/signing/bridge/active.json` and records a public completed
  bridge manifest.
- Optionally copies the new `.p12` Base64 value to the clipboard.

Immediately update both GitHub Actions Secrets with the replacement Base64 and
replacement password. Do this before committing and pushing the removal of
`active.json`; otherwise a workflow could build with the old Secret after the
bridge requirement has been disabled.

Then commit the bridge completion metadata and publish replacement-signed test
builds. Verify:

```text
bridge stable  -> new stable
bridge beta    -> new beta
bridge Nightly -> new Nightly
```

Keep the archived old `.p12` and password until the migration window is over.
They are needed to recover or rebuild a missed bridge release. Never upload the
archive to Git or replace it using `--force`.

### Recovery and safety rules

- `--prepare-renewal` refuses to run while another `active.json` exists.
- `--activate-renewal` refuses to run without the exact renewal id and
  `--confirm-bridge-release`.
- A build inside the normal 180-day expiry block is allowed only while an
  active bridge manifest is committed, so an urgent bridge remains possible.
- If preparation fails, the active identity and GitHub Secrets are unchanged.
- If bridge testing fails, keep the old Secrets and do not activate.

Run the renewal lifecycle regression test after changing any signing script or
bridge configuration:

```bash
pnpm test:signing-script
```
