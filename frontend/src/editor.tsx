import * as React from "react";
import {UnControlled as CodeMirror} from 'react-codemirror2';

import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/mode/clike/clike';
import 'codemirror/mode/cmake/cmake';
import 'codemirror/mode/coffeescript/coffeescript';
import 'codemirror/mode/commonlisp/commonlisp';
import 'codemirror/mode/css/css';
import 'codemirror/mode/diff/diff';
import 'codemirror/mode/django/django';
import 'codemirror/mode/dockerfile/dockerfile';
import 'codemirror/mode/go/go';
import 'codemirror/mode/groovy/groovy'; 
import 'codemirror/mode/handlebars/handlebars';
import 'codemirror/mode/htmlembedded/htmlembedded';
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/http/http';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/jsx/jsx'; 
import 'codemirror/mode/lua/lua';
import 'codemirror/mode/markdown/markdown';
import 'codemirror/mode/nginx/nginx';
import 'codemirror/mode/perl/perl';
import 'codemirror/mode/php/php';
import 'codemirror/mode/protobuf/protobuf';
import 'codemirror/mode/python/python';
import 'codemirror/mode/rst/rst';
import 'codemirror/mode/ruby/ruby';
import 'codemirror/mode/rust/rust';
import 'codemirror/mode/sass/sass';
import 'codemirror/mode/shell/shell';
import 'codemirror/mode/sql/sql';
import 'codemirror/mode/toml/toml';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/yaml/yaml';
import 'codemirror/mode/gfm/gfm';
import 'codemirror/theme/night.css';
import 'codemirror/theme/neo.css';
import 'codemirror/theme/ambiance.css';
import MenuItem from "@material-ui/core/MenuItem";
import Toolbar from "@material-ui/core/Toolbar";
import Select from "@material-ui/core/Select";
import Typography from "@material-ui/core/Typography";
import Paper from "@material-ui/core/Paper";

const modeInfo = [
    {name: "C", mime: "text/x-csrc", mode: "clike", ext: ["c", "h"]},
    {name: "C++", mime: "text/x-c++src", mode: "clike", ext: ["cpp", "c++", "cc", "cxx", "hpp", "h++", "hh", "hxx"], alias: ["cpp"]},
    {name: "CMake", mime: "text/x-cmake", mode: "cmake", ext: ["cmake", "cmake.in"], file: /^CMakeLists.txt$/},
    {name: "Common Lisp", mime: "text/x-common-lisp", mode: "commonlisp", ext: ["cl", "lisp", "el"], alias: ["lisp"]},
    {name: "CSS", mime: "text/css", mode: "css", ext: ["css"]},
    {name: "Dart", mimes: ["application/dart", "text/x-dart"], mode: "dart", ext: ["dart"]},
    {name: "diff", mime: "text/x-diff", mode: "diff", ext: ["diff", "patch"]},
    {name: "Django", mime: "text/x-django", mode: "django"},
    {name: "Dockerfile", mime: "text/x-dockerfile", mode: "dockerfile", file: /^Dockerfile$/},
    {name: "Embedded Javascript", mime: "application/x-ejs", mode: "htmlembedded", ext: ["ejs"]},
    {name: "GitHub Flavored Markdown", mime: "text/x-gfm", mode: "gfm", file: /^(readme|contributing|history).md$/i},
    {name: "Go", mime: "text/x-go", mode: "go", ext: ["go"]},
    {name: "HTML", mime: "text/html", mode: "htmlmixed", ext: ["html", "htm"], alias: ["xhtml"]},
    {name: "HTTP", mime: "message/http", mode: "http"},
    {name: "Java", mime: "text/x-java", mode: "clike", ext: ["java"]},
    {name: "JavaScript", mimes: ["text/javascript", "text/ecmascript", "application/javascript", "application/x-javascript", "application/ecmascript"],
     mode: "javascript", ext: ["js"], alias: ["ecmascript", "js", "node"]},
    {name: "JSON", mimes: ["application/json", "application/x-json"], mode: "javascript", ext: ["json", "map"], alias: ["json5"]},
    {name: "JSX", mime: "text/jsx", mode: "jsx", ext: ["jsx"]},
    {name: "LESS", mime: "text/x-less", mode: "css", ext: ["less"]},
    {name: "Lua", mime: "text/x-lua", mode: "lua", ext: ["lua"]},
    {name: "Markdown", mime: "text/x-markdown", mode: "markdown", ext: ["markdown", "md", "mkd"]},
    {name: "MariaDB SQL", mime: "text/x-mariadb", mode: "sql"},
    {name: "MySQL", mime: "text/x-mysql", mode: "sql"},
    {name: "Nginx", mime: "text/x-nginx-conf", mode: "nginx", file: /nginx.*\.conf$/i},
    {name: "Perl", mime: "text/x-perl", mode: "perl", ext: ["pl", "pm"]},
    {name: "PHP", mime: "application/x-httpd-php", mode: "php", ext: ["php", "php3", "php4", "php5", "phtml"]},
    {name: "Plain Text", mime: "text/plain", mode: "null", ext: ["txt", "text", "conf", "def", "list", "log"]},
    {name: "ProtoBuf", mime: "text/x-protobuf", mode: "protobuf", ext: ["proto"]},
    {name: "Python", mime: "text/x-python", mode: "python", ext: ["BUILD", "bzl", "py", "pyw"], file: /^(BUCK|BUILD)$/},
    {name: "reStructuredText", mime: "text/x-rst", mode: "rst", ext: ["rst"], alias: ["rst"]},
    {name: "Ruby", mime: "text/x-ruby", mode: "ruby", ext: ["rb"], alias: ["jruby", "macruby", "rake", "rb", "rbx"]},
    {name: "Rust", mime: "text/x-rustsrc", mode: "rust", ext: ["rs"]},
    {name: "SAS", mime: "text/x-sas", mode: "sas", ext: ["sas"]},
    {name: "Sass", mime: "text/x-sass", mode: "sass", ext: ["sass"]},
    {name: "SCSS", mime: "text/x-scss", mode: "css", ext: ["scss"]},
    {name: "Shell", mime: "text/x-sh", mode: "shell", ext: ["sh", "ksh", "bash"], alias: ["bash", "sh", "zsh"], file: /^PKGBUILD$/},
    {name: "SQL", mime: "text/x-sql", mode: "sql", ext: ["sql"]},
    {name: "TOML", mime: "text/x-toml", mode: "toml", ext: ["toml"]},
    {name: "TypeScript", mime: "application/typescript", mode: "javascript", ext: ["ts"], alias: ["ts"]},
    {name: "XML", mimes: ["application/xml", "text/xml"], mode: "xml", ext: ["xml", "xsl", "xsd", "svg"], alias: ["rss", "wsdl", "xsd"]},
    {name: "YAML", mimes: ["text/x-yaml", "text/yaml"], mode: "yaml", ext: ["yaml", "yml"], alias: ["yml"]},
];

const themes = ['default', 'ambiance', 'material', 'neo', 'night'];

interface IProps {
    setLang(lang:string): void;
    lang: string;
    setData(data:string): void;
    data: string;
    fixedLang: boolean;
    readOnly?: boolean;
    title: string;
}

interface IState {
    theme:string;
}

class Editor extends React.Component<IProps, IState> {
    state:IState;

    constructor(props:IProps) {
        super(props);
        this.state = {theme: "night"};
    }

    render() {
        const te = themes.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>);
        const lang = modeInfo.map(i => <MenuItem key={i.name} value={i.name}>{i.name}</MenuItem>);
        let mode = null;
        for (var i of modeInfo)
            if (i.name == this.props.lang)
                mode = i.mode;
        return (
            <Paper>
                <Toolbar>
                    <Typography>
                        <b>{this.props.title}</b>&nbsp;&nbsp;
                        Language:
                        {this.props.fixedLang
                            ? <span style={{marginLeft:10,marginRight:30}}>{this.props.lang}</span>
                            : <Select value={this.props.lang} onChange={(e) => this.props.setLang(e.target.value)}>
                                {lang}
                            </Select>}
                        Theme:
                        <Select value={this.state.theme} onChange={(e) => this.setState({theme: e.target.value})}>
                            {te}
                        </Select>
                    </Typography>
                </Toolbar>
                <CodeMirror value={this.props.data} options={{mode: mode, theme: this.state.theme, indentUnit: 4, indentWithTabs: true, lineNumbers:true, readOnly:this.props.readOnly, tabSize:4, showTrailingSpace: true, matchBrackets: true}} onChange={(e,d,v) => this.props.setData(v)} />
            </Paper>
        )
    }
}

export default Editor;
