import path from 'path'
import { Configuration } from 'webpack'

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
    }
}

export default commonConfig
