import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import webpack, { Configuration } from "webpack";

const commonConfig: Configuration = {
  mode: "development",
  target: "electron-renderer",
  entry: {
    MainView: path.resolve(__dirname, "View/MainView/App.tsx"),
    SplashView: path.resolve(__dirname, "View/SplashView/App.tsx"),
    PreferenceView: path.resolve(__dirname, "View/PreferenceView/App.tsx"),
    TerminalView: path.resolve(__dirname, "View/TerminalView/App.tsx"),
  },
  output: {
    path: path.resolve(__dirname, "../../dist/renderer/View"),
    filename: "[name].bundle.js",
    assetModuleFilename: "assets/[name][ext]",
    globalObject: "globalThis",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: "ts-loader",
        options: {
          configFile: path.resolve(__dirname, "tsconfig.json"),
          transpileOnly: true,
        },
      },
      {
        test: /\.css$/,
        use: [
          "style-loader",
          "css-loader",
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                plugins: {
                  "@tailwindcss/postcss": {},
                  autoprefixer: {},
                },
              },
            },
          },
        ],
      },
      {
        test: /\.(png|jpe?g|gif|webp)$/i,
        type: "asset/resource",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new webpack.DefinePlugin({
      global: "globalThis",
    }),
    new HtmlWebpackPlugin({
      filename: "MainView.html",
      template: "./src/Renderer/Template/index.html",
      chunks: ["MainView"],
    }),
    new HtmlWebpackPlugin({
      filename: "SplashView.html",
      template: "./src/Renderer/Template/index.html",
      chunks: ["SplashView"],
    }),
    new HtmlWebpackPlugin({
      filename: "PreferenceView.html",
      template: "./src/Renderer/Template/index.html",
      chunks: ["PreferenceView"],
    }),
    new HtmlWebpackPlugin({
      filename: "TerminalView.html",
      template: "./src/Renderer/Template/index.html",
      chunks: ["TerminalView"],
    }),
  ],
};

export default commonConfig;
