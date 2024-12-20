import { Chip } from "@mui/material";
import { observer } from "mobx-react";
import * as State from "./shared/state";
import { hostId } from "./shared/type";
import state from "./state";

const HostChip = observer(function HostChip({ id }: { id: number }) {
    const page = state.page;
    if (page === null) return <span>Missing state.page</span>;

    const hosts = state.objectDigests.get(hostId);
    const host = hosts?.get(id);
    const name = host?.name;
    const up = state.hostsUp.has(id);
    const pageDetails: State.IPage = { type: State.PAGE_TYPE.Object, objectType: hostId, id };
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
