import { Button, CircularProgress, Link, TextField } from "@mui/material";
import { observer } from "mobx-react";
import Box from "./Box";
import DisplayError from "./Error";
import InfoTable from "./InfoTable";
import nullCheck from "./shared/nullCheck";
import type { IPage } from "./shared/state";
import * as State from "./shared/state";
import state from "./state";

const Search = observer(function Search() {
    const s = state.search;
    if (s == null) {
        return <DisplayError>Missing state.searchState</DisplayError>;
    }

    const page = state.page;
    if (page === null) return <span>Missing state.page</span>;

    const rows = [];
    for (const o of s.objects) {
        const type = state.types.get(o.type);
        const p: IPage = { type: State.PAGE_TYPE.Object, objectType: o.type, id: o.id };
        rows.push(
            <tr key={o.id}>
                <td>{type ? type.name : o.type}</td>
                <td>
                    <Link
                        color={"textPrimary" as any}
                        onClick={(e) => {
                            page.onClick(e, p);
                        }}
                        href={page.link(p)}
                    >
                        {o.name}
                    </Link>
                </td>
                <td>{o.comment}</td>
                <td>
                    <Link
                        color={"textPrimary" as any}
                        onClick={(e) => {
                            page.onClick(e, p);
                        }}
                        href={page.link(p)}
                    >
                        {o.id}
                    </Link>
                </td>
                <td>{o.version}</td>
                <td>
                    {o.id !== s.content ? (
                        <Button
                            onClick={() => {
                                nullCheck(s).content = o.id;
                            }}
                        >
                            Show content
                        </Button>
                    ) : (
                        <Button
                            onClick={() => {
                                nullCheck(s).content = null;
                            }}
                        >
                            Hide content
                        </Button>
                    )}
                </td>
            </tr>,
        );
        if (o.id === s.content) {
            rows.push(
                <tr>
                    <td colSpan={6}>
                        <pre style={{ overflowX: "scroll", maxWidth: "96vw" }}>
                            {JSON.stringify(JSON.parse(o.content), null, 2).replace(/\\n/g, "\n")}
                        </pre>
                    </td>
                </tr>,
            );
        }
    }
    return (
        <Box title="Search" expanded={true} collapsable={false}>
            <form
                action="javascript:void(0);"
                onSubmit={(e) => {
                    nullCheck(s).search();
                    e.preventDefault();
                    return false;
                }}
            >
                <TextField
                    variant="standard"
                    fullWidth={true}
                    name="search"
                    helperText="Search"
                    value={s.key}
                    onChange={(e) => {
                        nullCheck(s).key = e.target.value;
                    }}
                />
            </form>
            {s.searching ? <CircularProgress /> : null}
            {rows.length !== 0 ? (
                <InfoTable>
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Name</th>
                            <th>Comment</th>
                            <th>Id</th>
                            <th>Version</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </InfoTable>
            ) : null}
        </Box>
    );
});

export default Search;
