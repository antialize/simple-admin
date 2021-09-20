var webpack = require('webpack');

module.exports = {
    entry: {
        main: ['./src/index.tsx']
    },
    
    output: {
        path: __dirname + '/public',
        publicPath: '/',
        filename: 'js/[name].bundle.js',
        sourceMapFilename: 'js/[name].bundle.js.map',
        chunkFilename: 'js/[id].chunk.js'
    },

    // Enable sourcemaps for debugging webpack's output.
    devtool: "source-map",

    resolve: {
        // Add '.ts' and '.tsx' as resolvable extensions.
        extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
    },

    optimization: {
        splitChunks: {
            name: false,
            chunks: "initial",
            minChunks: 1,
            cacheGroups: {
                vendor: {
                    test: /node_modules/,
                    chunks: 'all',
                    name: 'vendor',
                    enforce: true,
                    reuseExistingChunk: true,
                    filename: 'js/vendor.bundle.js',
                },
            }
        }
    },

    module: {
        rules: [
            { test: /\.tsx?$/, loader: "ts-loader" },
            { test: /\.css$/, use: ['style-loader', 'css-loader'] },
            { test: /\.js$/,  loader: "source-map-loader", enforce: "pre"},
            { test: /\.tsx?$/,  loader: "source-map-loader", enforce: "pre"}

        ]
    },

    devServer: {
        contentBase: "./public",
        https: true,
    }
};
