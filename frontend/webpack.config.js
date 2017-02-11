var webpack = require('webpack');
var path = require('path');
const ForkCheckerPlugin = require('awesome-typescript-loader').ForkCheckerPlugin;

module.exports = function (options) {
    return {
        entry: {
            vendor: ['react', 'react-dom', 'material-ui', 'react-tap-event-plugin'],
            main: './src/index.tsx'
        },

        output: {
        path: path.join(__dirname, 'public/js'),
        publicPath: '/js/',
        filename: '[name].bundle.js',
        sourceMapFilename: '[name].js.map',
        chunkFilename: '[id].chunk.js'
        },

        // Enable sourcemaps for debugging webpack's output.
        devtool: "source-map",

        resolve: {
            // Add '.ts' and '.tsx' as resolvable extensions.
            extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
        },

        module: {
            loaders: [
                // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
                { test: /\.tsx?$/, loader: "awesome-typescript-loader" }
            ]
        },

        devServer: {
            contentBase: "./public",
        }
    };
};