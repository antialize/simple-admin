var webpack = require('webpack');
var path = require('path');
var BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
//var CommonsChunkPlugin = require("../../lib/optimize/CommonsChunkPlugin");
module.exports = function (options) {
    return {
        entry: {
            vendor: ['react', 'react-dom', 'material-ui', 'react-tap-event-plugin', 
                     'xterm/dist/xterm.css', 'codemirror', 'chartjs' ,'react-redux', 'redux', 'react-chartjs-2', 'jquery',
                     'codemirror/lib/codemirror.css', 'codemirror/mode/apl/apl', 'codemirror/mode/asciiarmor/asciiarmor', 'codemirror/mode/asn.1/asn.1', 'codemirror/mode/asterisk/asterisk', 'codemirror/mode/brainfuck/brainfuck', 
                     'codemirror/mode/clike/clike', 'codemirror/mode/clojure/clojure', 'codemirror/mode/cmake/cmake', 'codemirror/mode/cobol/cobol', 'codemirror/mode/coffeescript/coffeescript', 'codemirror/mode/commonlisp/commonlisp', 
                     'codemirror/mode/crystal/crystal', 'codemirror/mode/css/css', 'codemirror/mode/cypher/cypher', 'codemirror/mode/d/d', 'codemirror/mode/dart/dart', 'codemirror/mode/diff/diff', 'codemirror/mode/django/django', 
                     'codemirror/mode/dockerfile/dockerfile', 'codemirror/mode/dtd/dtd', 'codemirror/mode/dylan/dylan', 'codemirror/mode/ebnf/ebnf', 'codemirror/mode/ecl/ecl', 'codemirror/mode/eiffel/eiffel', 'codemirror/mode/elm/elm', 
                     'codemirror/mode/erlang/erlang', 'codemirror/mode/factor/factor', 'codemirror/mode/fcl/fcl', 'codemirror/mode/forth/forth', 'codemirror/mode/fortran/fortran', 'codemirror/mode/gas/gas', 'codemirror/mode/gfm/gfm', 
                     'codemirror/mode/gherkin/gherkin', 'codemirror/mode/go/go', 'codemirror/mode/groovy/groovy', 'codemirror/mode/haml/haml', 'codemirror/mode/handlebars/handlebars', 'codemirror/mode/haskell/haskell', 
                     'codemirror/mode/haskell-literate/haskell-literate', 'codemirror/mode/haxe/haxe', 'codemirror/mode/htmlembedded/htmlembedded', 'codemirror/mode/htmlmixed/htmlmixed', 'codemirror/mode/http/http', 'codemirror/mode/idl/idl', 
                     'codemirror/mode/javascript/javascript', 'codemirror/mode/jinja2/jinja2', 'codemirror/mode/jsx/jsx', 'codemirror/mode/julia/julia', 'codemirror/mode/livescript/livescript', 'codemirror/mode/lua/lua', 'codemirror/mode/markdown/markdown', 
                     'codemirror/mode/mathematica/mathematica', 'codemirror/mode/mbox/mbox', 'codemirror/mode/mirc/mirc', 'codemirror/mode/mllike/mllike', 'codemirror/mode/modelica/modelica', 'codemirror/mode/mscgen/mscgen', 'codemirror/mode/mumps/mumps', 
                     'codemirror/mode/nginx/nginx', 'codemirror/mode/nsis/nsis', 'codemirror/mode/ntriples/ntriples', 'codemirror/mode/octave/octave', 'codemirror/mode/oz/oz', 'codemirror/mode/pascal/pascal', 'codemirror/mode/pegjs/pegjs', 
                     'codemirror/mode/perl/perl', 'codemirror/mode/php/php', 'codemirror/mode/pig/pig', 'codemirror/mode/powershell/powershell', 'codemirror/mode/properties/properties', 'codemirror/mode/protobuf/protobuf', 'codemirror/mode/pug/pug', 
                     'codemirror/mode/puppet/puppet', 'codemirror/mode/python/python', 'codemirror/mode/q/q', 'codemirror/mode/r/r', 'codemirror/mode/rpm/rpm', 'codemirror/mode/rst/rst', 'codemirror/mode/ruby/ruby', 'codemirror/mode/rust/rust', 
                     'codemirror/mode/sas/sas', 'codemirror/mode/sass/sass', 'codemirror/mode/scheme/scheme', 'codemirror/mode/shell/shell', 'codemirror/mode/sieve/sieve', 'codemirror/mode/slim/slim', 'codemirror/mode/smalltalk/smalltalk', 
                     'codemirror/mode/smarty/smarty', 'codemirror/mode/solr/solr', 'codemirror/mode/soy/soy', 'codemirror/mode/sparql/sparql', 'codemirror/mode/spreadsheet/spreadsheet', 'codemirror/mode/sql/sql', 'codemirror/mode/stex/stex', 
                     'codemirror/mode/stylus/stylus', 'codemirror/mode/swift/swift', 'codemirror/mode/tcl/tcl', 'codemirror/mode/textile/textile', 'codemirror/mode/tiddlywiki/tiddlywiki', 'codemirror/mode/tiki/tiki', 'codemirror/mode/toml/toml', 
                     'codemirror/mode/tornado/tornado', 'codemirror/mode/troff/troff', 'codemirror/mode/ttcn/ttcn', 'codemirror/mode/ttcn-cfg/ttcn-cfg', 'codemirror/mode/turtle/turtle', 'codemirror/mode/twig/twig', 'codemirror/mode/vb/vb', 
                     'codemirror/mode/vbscript/vbscript', 'codemirror/mode/velocity/velocity', 'codemirror/mode/verilog/verilog', 'codemirror/mode/vhdl/vhdl', 'codemirror/mode/vue/vue', 'codemirror/mode/webidl/webidl', 'codemirror/mode/xml/xml', 
                     'codemirror/mode/xquery/xquery', 'codemirror/mode/yacas/yacas', 'codemirror/mode/yaml/yaml', 'codemirror/mode/yaml-frontmatter/yaml-frontmatter', 'codemirror/mode/z80/z80', 
                     'codemirror/theme/3024-day.css', 'codemirror/theme/3024-night.css', 'codemirror/theme/abcdef.css', 'codemirror/theme/ambiance.css', 'codemirror/theme/base16-dark.css', 'codemirror/theme/bespin.css', 'codemirror/theme/base16-light.css', 
                     'codemirror/theme/blackboard.css', 'codemirror/theme/cobalt.css', 'codemirror/theme/colorforth.css', 'codemirror/theme/dracula.css', 'codemirror/theme/duotone-dark.css', 'codemirror/theme/duotone-light.css', 'codemirror/theme/eclipse.css', 
                     'codemirror/theme/elegant.css', 'codemirror/theme/erlang-dark.css', 'codemirror/theme/hopscotch.css', 'codemirror/theme/icecoder.css', 'codemirror/theme/isotope.css', 'codemirror/theme/lesser-dark.css', 'codemirror/theme/liquibyte.css', 
                     'codemirror/theme/material.css', 'codemirror/theme/mbo.css', 'codemirror/theme/mdn-like.css', 'codemirror/theme/midnight.css', 'codemirror/theme/monokai.css', 'codemirror/theme/neat.css', 'codemirror/theme/neo.css', 
                     'codemirror/theme/night.css', 'codemirror/theme/panda-syntax.css', 'codemirror/theme/paraiso-dark.css', 'codemirror/theme/paraiso-light.css', 'codemirror/theme/pastel-on-dark.css', 'codemirror/theme/railscasts.css', 
                     'codemirror/theme/rubyblue.css', 'codemirror/theme/seti.css', 'codemirror/theme/solarized.css', 'codemirror/theme/the-matrix.css', 'codemirror/theme/tomorrow-night-bright.css', 'codemirror/theme/tomorrow-night-eighties.css', 
                     'codemirror/theme/ttcn.css', 'codemirror/theme/twilight.css', 'codemirror/theme/vibrant-ink.css', 'codemirror/theme/xq-dark.css', 'codemirror/theme/xq-light.css', 'codemirror/theme/yeti.css', 'codemirror/theme/zenburn.css'],
            main: ['./src/index.tsx']
        },
        //xterm 'xterm/dist/addons/attach/attach', ,xterm/dist/addons/fit/fit', 'xterm/dist/addons/fullscreen/fullscreen'
       
        output: {
        path: path.join(__dirname, 'public'),
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

        //plugins: [
        //    new webpack.optimize.UglifyJsPlugin()
        //],
        plugins: [
            new webpack.optimize.CommonsChunkPlugin({
                names: ["vendor"],
            })/*,
            new BundleAnalyzerPlugin({  
                reportFilename: 'bundle.html',
                openAnalyzer: false,
                analyzerMode: 'static'})*/
        ],
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
