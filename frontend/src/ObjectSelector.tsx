import { Autocomplete, Chip, TextField } from "@mui/material";
import { observer } from "mobx-react";
import { HOST_ID, type IPage, PAGE_TYPE } from "./shared_types";
import state from "./state";

interface IProps {
    selected: number[];
    setSelected: (selected: number[]) => void;
    filter: (type: number, id: number) => boolean;
}

const ObjectSelector = observer(function ObjectSelector(p: IProps) {
    const sel: Record<number, boolean> = {};
    for (const s of p.selected) sel[s] = true;
    interface Item {
        label: string;
        value: number;
    }
    const all: Item[] = [];
    const selected: Item[] = [];
    for (const [type, ps] of state.objectDigests) {
        for (const [id, ct] of ps) {
            const tn = ct.type as number;
            if (!p.filter(tn, id)) continue;
            const t = state.types?.get(tn);
            const item: Item = { label: `${ct.name} (${t ? t.name : +type})`, value: id };
            all.push(item);
            if (id in sel) selected.push(item);
        }
    }

    return (
        <Autocomplete
            options={all}
            disableClearable
            multiple
            fullWidth
            getOptionKey={(item) => item.value}
            renderInput={(params) => (
                <TextField {...params} variant="standard" placeholder="Select objects" />
            )}
            value={selected}
            onChange={(_, values) => {
                p.setSelected(values.map((i) => i.value));
            }}
            renderTags={(tagValue, getTagProps) =>
                tagValue.map((option, index) => {
                    const { key, onDelete, ...tagProps } = getTagProps({ index });
                    let t = HOST_ID;
                    for (const [type, digests] of state.objectDigests) {
                        if (digests.has(option.value)) {
                            t = type;
                            break;
                        }
                    }
                    const pageDetails: IPage = {
                        type: PAGE_TYPE.Object,
                        objectType: t,
                        id: option.value,
                    };
                    const page = state.page;
                    if (page === null) return <span>Missing state.page</span>;
                    return (
                        <Chip
                            key={key}
                            label={option.label}
                            {...tagProps}
                            component="a"
                            onClick={(e) => {
                                e.preventDefault();
                                page.onClick(e, pageDetails);
                                return false;
                            }}
                            onDelete={(e) => {
                                e.preventDefault();
                                onDelete(e);
                                return false;
                            }}
                            href={page.link(pageDetails)}
                        />
                    );
                })
            }
        />
    );
});

export default ObjectSelector;
