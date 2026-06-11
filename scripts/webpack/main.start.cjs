const path = require("path");

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
};
