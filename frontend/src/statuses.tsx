import * as React from "react";
import { connect, Dispatch } from 'react-redux';
import { IMainState } from './reducers';
import { IStatus, IStatuses } from '../../shared/status';
import { hostId } from '../../shared/type';
import * as State from '../../shared/state';
import * as page from './page'
import {debugStyle} from './debug';
import {createSelector } from 'reselect';
import {StatusesCard} from './statusesCard';

interface StatusesProps {
    catagories: {name: string, hosts: number[]}[];
}

const getHosts = (state:IMainState) => state.objectDigests[hostId] || [];

const mapStateToProps = createSelector([getHosts], (hosts) => {
    const catagories: { [key: string]: {id: number, name: string}[] } = {};
    for (const host of hosts) {
        const cat = host.catagory || "Other";
        if (!(cat in catagories)) catagories[cat] = [];
        catagories[cat].push({id: host.id, name: host.name});
    }
    let cats = Object.keys(catagories);
    cats.sort();
    return {catagories: cats.map(cat => {
        const hosts = catagories[cat];
        hosts.sort((a, b) => a.name < b.name ? -1 : 1);
        return {name: cat, hosts: hosts.map(h=>h.id)};
    })};
});

function StatusesImpl(p: StatusesProps) {
    let chunks = [];
    for (const cat of p.catagories) {
        let hosts = cat.hosts;
        chunks.push(
            <div key={cat.name} style={debugStyle()}>
                <h2>{cat.name}</h2>
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(700px, 1fr))', width: "100%"
                }}>
                    {hosts.map(id => <StatusesCard key={id} id={id} />)}
                </div>
            </div>);
    }
    return <div style={debugStyle()}>{chunks}</div>;
}

export let Statuses = connect(mapStateToProps)(StatusesImpl);
