import React, { useEffect } from "react";
import type { Preview } from "@storybook/react";
import { i18n, is_supported_locale } from "../I18n";
import { apply_renderer_accent_color, is_accent_color } from "../Theme";

import "../style/index.css";

const preview: Preview = {
  globalTypes: {
    locale: {
      description: "Renderer locale",
      toolbar: {
        icon: "globe",
        items: [
          { value: "ko", title: "한국어" },
          { value: "en", title: "English" },
          { value: "ja", title: "日本語" },
          { value: "zh", title: "简体中文" },
        ],
        showName: true,
      },
    },
    accentColor: {
      description: "Renderer accent color",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "rose", title: "Rose" },
          { value: "sky", title: "Sky" },
          { value: "emerald", title: "Emerald" },
          { value: "violet", title: "Violet" },
          { value: "amber", title: "Amber" },
        ],
        showName: true,
      },
    },
  },
  initialGlobals: {
    locale: "ko",
    accentColor: "rose",
  },
  decorators: [
    (Story, context) => {
      const locale = String(context.globals.locale ?? "ko");
      const accentColor = String(context.globals.accentColor ?? "rose");

      useEffect(() => {
        if (is_supported_locale(locale)) {
          void i18n.changeLanguage(locale);
        }
      }, [locale]);

      useEffect(() => {
        if (is_accent_color(accentColor)) {
          apply_renderer_accent_color(accentColor);
        }
      }, [accentColor]);

      return React.createElement(Story);
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
