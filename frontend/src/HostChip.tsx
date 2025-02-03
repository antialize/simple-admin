import { Chip } from "@mui/material";
import { observer } from "mobx-react";
import { HOST_ID, type IPage, PAGE_TYPE } from "./shared_types";
import state from "./state";

const HostChip = observer(function HostChip({ id }: { id: number }) {
    const page = state.page;
    if (page === null) return <span>Missing state.page</span>;

    const hosts = state.objectDigests.get(HOST_ID);
    const host = hosts?.get(id);
    const name = host?.name;
    const up = state.hostsUp.has(id);
    const pageDetails: IPage = { type: PAGE_TYPE.Object, objectType: HOST_ID, id };
    return (
        <Chip
            style={{ margin: "4px" }}
            key={id}
            label={name}
            color={up ? "primary" : "secondary"}
            component="a"
            onClick={(e) => {
                page.onClick(e, pageDetails);
            }}
            href={page.link(pageDetails)}
        />
    );
});

export default HostChip;
