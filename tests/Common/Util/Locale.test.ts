import {
  FALLBACK_LOCALE,
  normalize_locale,
} from "../../../src/Common/Util/Locale";

describe("Locale", () => {
  it.each([
    ["ko-KR", "ko"],
    ["en_US", "en"],
    ["ja-JP", "ja"],
    ["zh-Hant", "zh"],
    ["fr-FR", "en"],
    [undefined, "en"],
  ])("normalizes %s to %s", (locale, expected) => {
    expect(normalize_locale(locale)).toBe(expected);
  });

  it("uses English as the unsupported-language fallback", () => {
    expect(FALLBACK_LOCALE).toBe("en");
  });
});
