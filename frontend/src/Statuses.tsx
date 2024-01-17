import {observer} from "mobx-react";
import state from "./state";
import {hostId} from "./shared/type";
import {Typography} from "@mui/material";
import HostChip from "./HostChip";

const Statuses = observer(function Statuses() {
    const catagories: Record<string, Array<{id: number; name: string}>> = {};
    const hosts = state.objectDigests.get(hostId);
    if (!hosts) return null;
    for (const [_, host] of hosts) {
        const cat = host.category || "Other";
        if (!(cat in catagories)) catagories[cat] = [];
        catagories[cat].push({id: host.id, name: host.name});
    }
    const cats = Object.keys(catagories);
    cats.sort();
    const cats2 = cats.map(cat => {
        const hosts = catagories[cat];
        hosts.sort((a, b) => (a.name < b.name ? -1 : 1));
        return {name: cat, hosts: hosts.map(h => h.id)};
    });

    const chunks = [];
    for (const cat of cats2) {
        const hosts = cat.hosts;
        chunks.push(
            <div key={cat.name}>
                <Typography variant="h6" component="span" color="textPrimary">
                    {cat.name}
                </Typography>
                <span style={{margin: "4px"}}>
                    {hosts.map(id => (
                        <HostChip key={id} id={id} />
                    ))}
                </span>
            </div>,
        );
    }
    return <div>{chunks}</div>;
});

export default Statuses;
