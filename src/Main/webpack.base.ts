import path from 'path'
import webpack, { Configuration } from 'webpack'

const DISCORD_ENV_NAMES = [
    'BDIH_DISCORD_CLIENT_ID',
    'BDIH_DISCORD_SHOW_IDLE',
    'BDIH_DISCORD_LARGE_IMAGE_KEY',
    'BDIH_DISCORD_LARGE_IMAGE_TEXT',
    'BDIH_DISCORD_SMALL_IMAGE_KEY',
    'BDIH_DISCORD_SMALL_IMAGE_TEXT',
] as const

const discordEnvDefinitions = Object.fromEntries(
    DISCORD_ENV_NAMES.map((name) => [
        `process.env.${name}`,
        JSON.stringify(process.env[name] ?? ''),
    ]),
)

const commonConfig: Configuration = {
    target: 'electron-main',
    entry: {
        main: path.resolve(__dirname, 'Main.ts')
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: path.resolve(__dirname, 'tsconfig.json'),
                            transpileOnly: true
                        }
                    }

                ]
            }
        ]
    },

    resolve: {
        extensions: ['.ts', '.js'],
    },
    plugins: [
        new webpack.IgnorePlugin({
            resourceRegExp: /^(bufferutil|utf-8-validate)$/
        }),
        new webpack.DefinePlugin(discordEnvDefinitions),
    ]
}

export default commonConfig
