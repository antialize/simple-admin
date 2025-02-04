import { MenuItem, Select, TextField } from "@mui/material";
import { observer } from "mobx-react";
import derivedState from "./derivedState";
import { TypePropType } from "./shared_types";
import type { ITrigger } from "./type_types";

interface TriggersProps {
    triggers: ITrigger[];
    setTriggers: (triggers: ITrigger[]) => void;
}

const Triggers = observer(function Triggers(p: TriggersProps) {
    const triggers = p.triggers.slice(0);
    const rows: JSX.Element[] = [];
    const setTriggers = () => {
        p.setTriggers(triggers.filter((t) => t.id !== 0));
    };

    for (let i = 0; i <= triggers.length; ++i) {
        const v = i < triggers.length && triggers[i];

        const t = v ? derivedState.triggers.find((t) => t.id === v.id) : null;
        const fields: JSX.Element[] = [];
        if (v && t?.content?.content) {
            for (const item of t.content.content) {
                switch (item.type) {
                    case TypePropType.text: {
                        const itt = item; // hintText={item.title}
                        fields.push(
                            <TextField
                                key={item.name}
                                value={v?.values?.[item.name] ?? item.default}
                                disabled={!v}
                                onChange={(e) => {
                                    triggers[i].values = Object.assign({}, triggers[i].values);
                                    triggers[i].values[itt.name] = e.target.value;
                                    setTriggers();
                                }}
                                variant="standard"
                            />,
                        );
                    }
                }
            }
        }
        rows.push(
            <tr key={i}>
                <td>
                    <Select
                        variant="standard"
                        // biome-ignore lint: v can be 0
                        value={(v && v.id) || 0}
                        onChange={(e) => {
                            if (v) triggers[i] = { id: +(e.target.value as any), values: [] };
                            else triggers.push({ id: +(e.target.value as any), values: [] });
                            setTriggers();
                        }}
                    >
                        <MenuItem value={0}>None</MenuItem>
                        {derivedState.triggers.map((t) => (
                            <MenuItem key={t.name} value={t.id}>
                                {t.name}
                            </MenuItem>
                        ))}
                    </Select>
                </td>
                <td>{fields}</td>
            </tr>,
        );
    }

    return (
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Content</th>
                    <th />
                </tr>
            </thead>
            <tbody>{rows}</tbody>
        </table>
    );
});

export default Triggers;
