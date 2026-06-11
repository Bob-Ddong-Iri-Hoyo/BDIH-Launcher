const path = require("path");

module.exports = {
  mode: "development",
  target: "electron-preload",
  entry: {
    main: path.resolve(__dirname, "../../src/Preload/preload.ts"),
  },
  output: {
    filename: "preload.js",
    path: path.resolve(__dirname, "../../dist/main"),
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "ts-loader",
        options: {
          configFile: path.resolve(__dirname, "../../src/Preload/tsconfig.json"),
          transpileOnly: true,
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
};
