import { Button, Link, List, ListItem, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react";
import nullCheck from "./shared/nullCheck";
import * as State from "./shared/state";
import state from "./state";

const ObjectList = observer(function ObjectList({ type }: { type: number }) {
    const page = state.page;
    if (page === null) return <span>Missing state.page</span>;
    const filter = state.objectListFilter.get(type) ?? "";
    const lst = [];
    const digests = state.objectDigests.get(type);
    if (digests !== undefined) {
        for (const [_, v] of digests) {
            if (v.name.toLowerCase().includes(filter.toLowerCase())) lst.push(v);
        }
        lst.sort((l, r) => {
            return l.name < r.name ? -1 : 1;
        });
    }
    return (
        <>
            <Typography variant="h5" component="h3">
                List of {nullCheck(state.types.get(type)).content.plural}
            </Typography>
            <TextField
                placeholder="Filter"
                onChange={(e) => {
                    state.objectListFilter.set(type, e.target.value);
                }}
                value={filter}
            />
            <List>
                {lst.map((v) => (
                    <ListItem
                        key={v.id}
                        onClick={(e) => {
                            page.onClick(e, {
                                type: State.PAGE_TYPE.Object,
                                objectType: type,
                                id: v.id,
                            });
                        }}
                    >
                        <Link color={"textPrimary" as any}>{v.name}</Link>
                    </ListItem>
                ))}
            </List>
            <Button
                variant="contained"
                onClick={(e) => {
                    page.onClick(e, { type: State.PAGE_TYPE.Object, objectType: type });
                }}
                href={page.link({ type: State.PAGE_TYPE.Object, objectType: type })}
            >
                Add new
            </Button>
        </>
    );
});

export default ObjectList;
