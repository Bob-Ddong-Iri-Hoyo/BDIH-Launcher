# Locale resources

Each JSON file is an i18next resource bundle for one locale.

- `ko.json`: Korean fallback locale
- `en.json`: English
- `ja.json`: Japanese scaffold

During packaging, this folder is copied into `.app/Contents/Resources/locales`.
At runtime, the renderer starts with bundled JSON imports and then asks the main process to load packaged locale files from that folder. Packaged files can override bundled strings for registered locales.

To add a language:

1. Copy `en.json` to `<locale>.json`.
2. Set `translation.localeMeta.nativeName` to the language name as written in that language, for example `한국어`, `English`, or `日本語`.
3. Translate the values.
4. Register the locale in `src/Renderer/I18n/Locale.ts` so it appears in the language selector.
5. Rebuild or place the JSON in `.app/Contents/Resources/locales` for an existing registered locale.
