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

Stable and beta use the normal application bundle identifier. Nightly uses its
separate Nightly bundle identifier, but all channels use the same signing
certificate.

The first certificate-signed build cannot update an installation made with the
old per-build ad-hoc signature. Install that first signed build manually once;
later builds signed with the same `.p12` can validate update continuity.





