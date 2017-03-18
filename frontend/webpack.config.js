var webpack = require('webpack');
var path = require('path');
const ForkCheckerPlugin = require('awesome-typescript-loader').ForkCheckerPlugin;
module.exports = function (options) {
    return {
        entry: {
            vendor: ['react', 'react-dom', 'material-ui', 'react-tap-event-plugin', 
                     'xterm/dist/xterm.css' ],
            main: ['./src/index.tsx']
        },
        //xterm 'xterm/dist/addons/attach/attach', ,xterm/dist/addons/fit/fit', 'xterm/dist/addons/fullscreen/fullscreen'
       
        output: {
        path: path.join(__dirname, 'public'),
        publicPath: '/',
        filename: 'js/[name].bundle.js',
        sourceMapFilename: 'js/[name].js.map',
        chunkFilename: 'js/[id].chunk.js'
        },

        // Enable sourcemaps for debugging webpack's output.
        devtool: "source-map",

        resolve: {
            // Add '.ts' and '.tsx' as resolvable extensions.
            extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
        },

        //plugins: [
        //    new webpack.optimize.UglifyJsPlugin()
        //],
        
        module: {
            loaders: [
                // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
                { test: /\.tsx?$/, loader: "awesome-typescript-loader" },
                { test: /\.css$/, loader: 'style-loader!css-loader'},
                { test: /\.js$/,  loader: "source-map-loader", enforce: "pre"},
                { test: /\.tsx?$/,  loader: "source-map-loader", enforce: "pre"}

            ]
        },

        devServer: {
            contentBase: "./public",
        }
    };
};