import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import { StreamLanguage } from "@codemirror/language";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { nginx } from "@codemirror/legacy-modes/mode/nginx";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { MenuItem, Paper, Select, Toolbar, Typography } from "@mui/material";
import CodeMirror from "@uiw/react-codemirror";

const langs = [
    {
        name: "Diff",
        mime: "text/x-diff",
        mode: StreamLanguage.define(diff),
        ext: ["diff", "patch"],
    },
    {
        name: "JavaScript",
        mimes: [
            "text/javascript",
            "text/ecmascript",
            "application/javascript",
            "application/x-javascript",
            "application/ecmascript",
        ],
        mode: javascript(),
        ext: ["js"],
        alias: ["ecmascript", "js", "node"],
    },
    {
        name: "JSON",
        mimes: ["application/json", "application/x-json"],
        mode: json(),
        ext: ["json", "map"],
        alias: ["json5"],
    },
    {
        name: "Nginx",
        mime: "text/x-nginx-conf",
        mode: StreamLanguage.define(nginx),
        file: /nginx.*\.conf$/i,
    },
    {
        name: "Plain Text",
        mime: "text/plain",
        mode: null,
        ext: ["txt", "text", "conf", "def", "list", "log"],
    },
    {
        name: "Python",
        mime: "text/x-python",
        mode: python(),
        ext: ["BUILD", "bzl", "py", "pyw"],
        file: /^(BUCK|BUILD)$/,
    },
    {
        name: "Shell",
        mime: "text/x-sh",
        mode: StreamLanguage.define(shell),
        ext: ["sh", "ksh", "bash"],
        alias: ["bash", "sh", "zsh"],
        file: /^PKGBUILD$/,
    },
    { name: "TOML", mime: "text/x-toml", mode: StreamLanguage.define(toml), ext: ["toml"] },
    {
        name: "TypeScript",
        mime: "application/typescript",
        mode: javascript({ typescript: true }),
        ext: ["ts"],
        alias: ["ts"],
    },
    {
        name: "XML",
        mimes: ["application/xml", "text/xml"],
        mode: xml(),
        ext: ["xml", "xsl", "xsd", "svg"],
        alias: ["rss", "wsdl", "xsd"],
    },
    {
        name: "YAML",
        mimes: ["text/x-yaml", "text/yaml"],
        mode: StreamLanguage.define(yaml),
        ext: ["yaml", "yml"],
        alias: ["yml"],
    },
];

interface IProps {
    setLang?: (lang: string) => void;
    lang: string;
    setData?: (data: string) => void;
    data: string;
    fixedLang: boolean;
    readOnly?: boolean;
    title: string;
}

function Editor(props: IProps) {
    const langItems = langs.map((i) => (
        <MenuItem key={i.name} value={i.name}>
            {i.name}
        </MenuItem>
    ));
    const exts = [];

    for (const lang of langs) if (lang.name === props.lang && lang.mode) exts.push(lang.mode);
    return (
        <Paper>
            <Toolbar>
                <Typography>
                    <b>{props.title}</b>&nbsp;&nbsp;Language:&nbsp;
                </Typography>
                {props.fixedLang ? (
                    <Typography>
                        <span style={{ marginLeft: 10, marginRight: 30 }}>{props.lang}</span>
                    </Typography>
                ) : (
                    <Select
                        variant="standard"
                        value={props.lang}
                        onChange={(e) => {
                            props.setLang?.(e.target.value);
                        }}
                    >
                        {langItems}
                    </Select>
                )}
            </Toolbar>
            <CodeMirror
                value={props.data}
                theme={"dark"}
                onChange={(val, _) => {
                    props.setData?.(val);
                }}
                extensions={exts}
                readOnly={props.readOnly}
            />
        </Paper>
    );
}

export default Editor;
