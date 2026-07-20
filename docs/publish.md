# Publishing and macOS signing

BDIH Launcher currently uses one self-signed update identity for release,
prerelease, and Nightly builds. This provides a stable designated requirement
for Squirrel.Mac update continuity, but it is not an Apple Developer ID and does
not provide Gatekeeper trust or notarization.

## GitHub Actions secrets

Configure these repository secrets in the source repository that runs both
`release.yml` and `nightly.yml`:

- `MACOS_SIGNING_P12_BASE64`: Base64 contents of
  `private/bdih-code-signing.p12`.
- `MACOS_SIGNING_P12_PASSWORD`: The exact password used to export the `.p12`.

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

## Workflow behavior

Both publish workflows install the identity in a temporary Keychain, require
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


