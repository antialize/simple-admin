import { FormControlLabel, MenuItem, Select, Switch, TextField, useTheme } from "@mui/material";
import type { JSX } from "react";
import { type ITypeProp, TypePropType } from "./shared_types";

function TypeContent(p: { content: ITypeProp[]; onChange: (v: ITypeProp[]) => void }) {
    const rows = [];
    const c = p.content.slice(0);
    c.push({ type: TypePropType.none });
    const theme = useTheme();

    const td = { color: theme.palette.text.primary };
    const th = { color: theme.palette.text.primary };

    for (let i = 0; i < c.length; ++i) {
        const r = c[i];
        if (r.type === TypePropType.none && i + 1 !== c.length) continue;

        const changeType = (type: TypePropType) => {
            if (r && type === r.type) return;
            c[i] = { type } as ITypeProp;
            p.onChange(c);
        };

        const change = (o: Record<string, any>) => {
            c[i] = Object.assign({}, r || {}, o) as ITypeProp;
            p.onChange(c.filter((c) => c.type !== TypePropType.none));
        };
        let def: JSX.Element;
        if (
            r.type === TypePropType.none ||
            r.type === TypePropType.typeContent ||
            r.type === TypePropType.document ||
            r.type === TypePropType.password ||
            r.type === TypePropType.monitor
        )
            def = <TextField variant="standard" value="" disabled={true} />;
        else if (r.type === TypePropType.bool) {
            def = (
                <Select
                    variant="standard"
                    value={r.default ? 1 : 0}
                    onChange={(e) => {
                        change({ default: !!e.target.value });
                    }}
                >
                    <MenuItem value={1}>On</MenuItem>
                    <MenuItem value={0}>Off</MenuItem>
                </Select>
            );
        } else if (r.type === TypePropType.choice) {
            def = (
                <Select
                    variant="standard"
                    value={r.default || ""}
                    onChange={(e) => {
                        change({ default: e.target.value });
                    }}
                    disabled={!r.choices || r.choices.length === 0}
                >
                    {(r.choices || [""]).map((v) => (
                        <MenuItem value={v} key={v}>
                            {v}
                        </MenuItem>
                    ))}
                </Select>
            );
        } else {
            def = (
                <TextField
                    value={r.default}
                    onChange={(e) => {
                        change({ default: e.target.value });
                    }}
                />
            );
        }
        let temp: JSX.Element;
        if (r.type === TypePropType.text || r.type === TypePropType.document)
            temp = (
                <Switch
                    key="template"
                    checked={r.template}
                    onChange={(e) => {
                        change({ template: e.target.checked });
                    }}
                />
            );
        else temp = <Switch key="template" checked={false} disabled={true} />;
        let var_: JSX.Element;
        if (
            r.type === TypePropType.text ||
            r.type === TypePropType.choice ||
            r.type === TypePropType.bool ||
            r.type === TypePropType.document
        )
            var_ = (
                <TextField
                    variant="standard"
                    key="var"
                    value={r.variable}
                    onChange={(e) => {
                        change({ variable: e.target.value });
                    }}
                />
            );
        else var_ = <TextField variant="standard" key="var" value="" disabled={true} />;
        let extra = null;
        if (r.type === TypePropType.choice)
            extra = (
                <TextField
                    variant="standard"
                    value={(r.choices || []).join(", ").trim()}
                    onChange={(e) => {
                        change({ choices: e.target.value.split(",").map((v) => v.trim()) });
                    }}
                />
            );
        else if (r.type === TypePropType.document)
            extra = (
                <span>
                    <TextField
                        variant="standard"
                        key="langname"
                        value={r.langName || ""}
                        onChange={(e) => {
                            change({ langName: e.target.value });
                        }}
                    />
                    <TextField
                        variant="standard"
                        key="lang"
                        value={r.lang || ""}
                        onChange={(e) => {
                            change({ lang: e.target.value });
                        }}
                    />
                </span>
            );
        else if (r.type === TypePropType.text)
            extra = (
                <span style={{ verticalAlign: "middle" }}>
                    <Select
                        variant="standard"
                        value={r.lines ?? 0}
                        onChange={(e) => {
                            change({ lines: +(e.target.value as any) });
                        }}
                        style={{ width: "120px", display: "inline-block", verticalAlign: "middle" }}
                    >
                        <MenuItem key={0} value={0}>
                            Normal
                        </MenuItem>
                        <MenuItem key={1} value={1}>
                            1 Line
                        </MenuItem>
                        <MenuItem key={2} value={2}>
                            2 Lines
                        </MenuItem>
                        <MenuItem key={3} value={3}>
                            3 Lines
                        </MenuItem>
                        <MenuItem key={4} value={4}>
                            4 Lines
                        </MenuItem>
                        <MenuItem key={5} value={5}>
                            5 Lines
                        </MenuItem>
                    </Select>
                    <FormControlLabel
                        label="Deploy title"
                        labelPlacement="end"
                        control={
                            <Switch
                                key="deploytitle"
                                checked={r.deployTitle}
                                onChange={(e) => {
                                    change({ deployTitle: e.target.checked });
                                }}
                                style={{
                                    width: "120px",
                                    display: "inline-block",
                                    verticalAlign: "middle",
                                }}
                            />
                        }
                    />
                </span>
            );

        rows.push(
            <tr key={i}>
                <td>
                    <Select
                        value={r.type}
                        onChange={(e) => {
                            changeType(+(e.target.value as any));
                        }}
                    >
                        <MenuItem value={TypePropType.bool}>Bool</MenuItem>
                        <MenuItem value={TypePropType.text}>Text</MenuItem>
                        <MenuItem value={TypePropType.password}>Password</MenuItem>
                        <MenuItem value={TypePropType.document}>Document</MenuItem>
                        <MenuItem value={TypePropType.choice}>Choice</MenuItem>
                        <MenuItem value={TypePropType.typeContent}>Type Content</MenuItem>
                        <MenuItem value={TypePropType.none}>Nothing</MenuItem>
                    </Select>
                </td>
                <td>
                    <TextField
                        variant="standard"
                        value={
                            (r.type !== TypePropType.none &&
                                r.type !== TypePropType.monitor &&
                                r.name) ||
                            ""
                        }
                        disabled={r.type === TypePropType.none}
                        onChange={(e) => {
                            change({ name: e.target.value });
                        }}
                    />
                </td>
                <td>
                    <TextField
                        variant="standard"
                        value={
                            (r.type !== TypePropType.none &&
                                r.type !== TypePropType.monitor &&
                                r.type !== TypePropType.typeContent &&
                                r.title) ||
                            ""
                        }
                        disabled={
                            r.type === TypePropType.none || r.type === TypePropType.typeContent
                        }
                        onChange={(e) => {
                            change({ title: e.target.value });
                        }}
                    />
                </td>
                <td style={td}>{def}</td>
                <td style={td}>{temp}</td>
                <td style={td}>{var_}</td>
                <td>
                    <TextField
                        variant="standard"
                        value={
                            (r.type !== TypePropType.none &&
                                r.type !== TypePropType.monitor &&
                                r.type !== TypePropType.typeContent &&
                                r.description) ||
                            ""
                        }
                        disabled={
                            r.type === TypePropType.none || r.type === TypePropType.typeContent
                        }
                        onChange={(e) => {
                            change({ description: e.target.value });
                        }}
                    />
                </td>
                <td style={td}>{extra}</td>
            </tr>,
        );
    }

    return (
        <table>
            <thead>
                <tr>
                    <th style={th}>Type</th>
                    <th style={th}>Name</th>
                    <th style={th}>Title</th>
                    <th style={th}>Default</th>
                    <th style={th}>Template</th>
                    <th style={th}>Variable</th>
                    <th style={th}>Description</th>
                    <th style={th}>Extra</th>
                </tr>
            </thead>
            <tbody>{rows}</tbody>
        </table>
    );
}

export default TypeContent;
