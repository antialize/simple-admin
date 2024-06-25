import { Button, TextField, Typography } from "@mui/material";
import { useState } from "react";

interface IProps {
    variables: Array<{ key: string; value: string }>;
    secret?: boolean;
    setVariables: (vars: Array<{ key: string; value: string }>) => void;
}

function Variables(props: IProps) {
    const [filter, setFilter] = useState<string>("");

    const vars = props.variables.slice(0);
    const rows = [];
    const setVars = () => {
        props.setVariables(vars.filter((v) => v.key !== "" || v.value !== ""));
    };

    for (let i = 0; i < vars.length; ++i) {
        const v = vars[i];
        if (filter !== "" && !v.key.toLowerCase().includes(filter.toLowerCase())) continue;
        rows.push(
            <tr key={i}>
                <td>
                    <TextField
                        value={v.key}
                        onChange={(e) => {
                            vars[i].key = e.target.value;
                            setVars();
                        }}
                        variant="standard"
                    />
                </td>
                <td>
                    <TextField
                        value={v.value}
                        onChange={(e) => {
                            vars[i].value = e.target.value;
                            setVars();
                        }}
                        variant="standard"
                        type={props.secret ? "password" : "text"}
                        style={{ width: 500 }}
                    />
                </td>
                <td>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                            navigator.clipboard.writeText(v.value);
                        }}
                    >
                        Copy
                    </Button>
                </td>
            </tr>,
        );
    }

    rows.push(
        <tr key={vars.length}>
            <td>
                <TextField
                    value=""
                    onChange={(e) => {
                        vars.push({ key: e.target.value, value: "" });
                        setVars();
                    }}
                    variant="standard"
                />
            </td>
            <td>
                <TextField
                    value=""
                    onChange={(e) => {
                        vars.push({ key: "", value: e.target.value });
                        setVars();
                    }}
                    variant="standard"
                    type={props.secret ? "password" : "text"}
                    style={{ width: 500 }}
                />
            </td>
            <td />
        </tr>,
    );

    return (
        <table>
            <thead>
                <tr>
                    <th>
                        <TextField
                            label="Key"
                            size="small"
                            value={filter}
                            onChange={(e) => {
                                setFilter(e.target.value);
                            }}
                            variant="standard"
                        />
                    </th>
                    <th>
                        <Typography>Value</Typography>
                    </th>
                    <th>Copy</th>
                </tr>
            </thead>
            <tbody>{rows}</tbody>
        </table>
    );
}

export default Variables;
