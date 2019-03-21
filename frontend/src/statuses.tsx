import * as React from "react";
import { hostId } from '../../shared/type';
import StatusesCard from './statusesCard';
import state from "./state";
import { observer } from "mobx-react";

export default observer(()=>{
    const catagories: { [key: string]: {id: number, name: string}[] } = {};
    const hosts = state.objectDigests.get(hostId);
    if (!hosts) return null;
    for (const [id, host] of hosts) {
        const cat = host.catagory || "Other";
        if (!(cat in catagories)) catagories[cat] = [];
        catagories[cat].push({id: host.id, name: host.name});
    }
    let cats = Object.keys(catagories);
    cats.sort();
    let cats2 =  cats.map(cat => {
        const hosts = catagories[cat];
        hosts.sort((a, b) => a.name < b.name ? -1 : 1);
        return {name: cat, hosts: hosts.map(h=>h.id)};
    });

    let chunks = [];
    for (const cat of cats2) {
        let hosts = cat.hosts;
        chunks.push(
            <div key={cat.name}>
                <h2>{cat.name}</h2>
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(700px, 1fr))', width: "100%"
                }}>
                    {hosts.map(id => <StatusesCard key={id} id={id} />)}
                </div>
            </div>);
    }
    return <div>{chunks}</div>;
});
