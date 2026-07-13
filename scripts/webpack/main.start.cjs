const path = require("path");
const webpack = require("webpack");

const DISCORD_ENV_NAMES = [
  "BDIH_DISCORD_CLIENT_ID",
  "BDIH_DISCORD_SHOW_IDLE",
  "BDIH_DISCORD_LARGE_IMAGE_KEY",
  "BDIH_DISCORD_LARGE_IMAGE_TEXT",
  "BDIH_DISCORD_SMALL_IMAGE_KEY",
  "BDIH_DISCORD_SMALL_IMAGE_TEXT",
];

const discordEnvDefinitions = Object.fromEntries(
  DISCORD_ENV_NAMES.map((name) => [
    `process.env.${name}`,
    JSON.stringify(process.env[name] ?? ""),
  ]),
);

module.exports = {
  mode: "development",
  target: "electron-main",
  entry: {
    main: path.resolve(__dirname, "../../src/Main/Main.ts"),
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "../../dist/main"),
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "ts-loader",
        options: {
          configFile: path.resolve(__dirname, "../../src/Main/tsconfig.json"),
          transpileOnly: true,
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /^(bufferutil|utf-8-validate)$/,
    }),
    new webpack.DefinePlugin(discordEnvDefinitions),
  ],
};
