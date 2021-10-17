import * as React from 'react';
import { ACTION, IDockerListDeploymentsRes, DockerDeployment, IDockerDeploymentsChanged, IDockerListDeploymentHistoryRes } from './shared/actions';
import { observable, action, ObservableMap, makeObservable } from 'mobx';
import { observer } from 'mobx-react';
import CircularProgress from "@material-ui/core/CircularProgress";
import Box from './Box';
import { withStyles, StyledComponentProps } from "@material-ui/core/styles";
import { hostId } from './shared/type';
import Button from '@material-ui/core/Button';
import UnixTime from './UnixTime';
import { IPage } from './shared/state';
import state from "./state";
import * as State from './shared/state'
import { InformationListRow, InformationList } from './InformationList';
import Typography from '@material-ui/core/Typography';
import Remote from './Remote'
import styles from './styles'
import extractRemote from './extractRemote';
import getOrInsert from './shared/getOrInsert';
import Error from "./Error";
import nullCheck from './shared/nullCheck';

export class DockerContainersState {
    constructor() {
        makeObservable(this)
    }
    
    @observable
    hosts: Remote<ObservableMap<number, DockerDeployment[]>> = {state: 'initial'};

    @observable
    containerHistory: ObservableMap<number, ObservableMap<string,  Remote< ObservableMap<number, DockerDeployment> >>> = new ObservableMap;

    @action
    load() {
        if (this.hosts.state != 'initial') return;
        state.sendMessage({
            type: ACTION.DockerListDeployments,
            ref: 0
        });
        this.hosts = {state: 'loading'}
    }

    @action
    loadHistory(host:number, container: string) {
        let c1 = this.containerHistory.get(host);
        if (!c1) {
            c1 = new ObservableMap();
            this.containerHistory.set(host, c1);
        }
        let c2 = c1.get(container);
        if (c2 && c2.state != 'initial') return;
        state.sendMessage({
            type: ACTION.DockerListDeploymentHistory,
            host: host,
            name: container,
            ref: 0
        });
        c1.set(container, {state: "loading"});
    }

    @action
    handleLoad(act: IDockerListDeploymentsRes) {
        if (this.hosts.state != 'data')
            this.hosts = {state: 'data', data: new ObservableMap()};

        for (const tag of act.deployments) {
            getOrInsert(this.hosts.data, tag.host, ()=>[]).push(tag);
        }
    }

    @action
    handleLoadHistory(act: IDockerListDeploymentHistoryRes) {
        const h = this.containerHistory.get(+act.host);
        if (!h) return;
        const m = new ObservableMap();
        for (const d of act.deployments)
            m.set(d.id, d);
        h.set(act.name, {state: 'data', data:m});
    }

    @action
    handleChange(act: IDockerDeploymentsChanged) {
        if (this.hosts.state == 'data') {
            const hosts = this.hosts.data;
            for (const tag of act.changed) {
                let found = false;
                const lst = getOrInsert(hosts, tag.host, ()=>[]);
                for (let i=0; i < lst.length; ++i) {
                    if (lst[i].name != tag.name) continue;
                    found = true;
                    if (lst[i].id <= tag.id)
                        lst[i] = tag;
                }
                if (!found) lst.push(tag);

            }
            for (const tag of act.removed) {
                let lst = hosts.get(tag.host);
                if (!lst) continue;
                hosts.set(tag.host, lst.filter((e) => e.name != tag.name));
            }
        }

        for (const tag of act.changed) {
            const h = this.containerHistory.get(tag.host);
            if (!h) continue;
            const hh = h.get(tag.name);
            if (!hh || hh.state !== 'data') continue;
            hh.data.set(tag.id, tag);
        }
    }
}

export const HostDockerContainers = withStyles(styles)(observer(function DockerContainers(p:{host:number; title?:string, standalone: boolean} & StyledComponentProps) {
    const classes = p.classes;
    if (!classes) return <Error>Missing classes</Error>;
    const dockerContainers = state.dockerContainers;
    if (!dockerContainers) return <Error>Missing state.dockerContainers</Error>;
    const r = extractRemote(dockerContainers.hosts);
    if (r.state != 'good') return r.error;
    const page = state.page;
    if (!page) return <Error>Missing state.page</Error>;
    const hosts = r.data;
    const hostDigests = state.objectDigests.get(hostId);
    const hostDigest = hostDigests && hostDigests.get(p.host);
    const hostName = hostDigest && hostDigest.name;
    if (!hostName) return <Error>Missing hostName</Error>;
    const originalContainers = hosts.get(p.host);
    if (!originalContainers) return <Error>Missing originalContainers</Error>;
    let containers = originalContainers.slice();
    containers.sort((a, b)=> {
        return a.name < b.name ? -1 : 1;
    });

    let rows = [];
    for (const container of containers) {
        let commit = "";
        if (container.imageInfo && container.imageInfo.labels) {
            commit = (container.imageInfo.labels.GIT_BRANCH || "") + " " + (container.imageInfo.labels.GIT_COMMIT || "");
        }
        const historyPage: IPage = {type: State.PAGE_TYPE.DockerContainerHistory, host: p.host, container: container.name};
        const detailsPage: IPage = {type: State.PAGE_TYPE.DockerContainerDetails, host: p.host, container: container.name, id: container.id};
        rows.push(
            <tr key={container.name}>
                <td>{container.name}</td>
                <td>{container.image}</td>
                <td>{container.state || ""}</td>
                <td>{commit}</td>
                <td>{container.user}</td>
                <td>{container.hash? container.hash.substr(7,12) : ""}</td>
                <td>{container.start?<UnixTime time={container.start} />:null}</td>
                <td>{container.end?<UnixTime time={container.end} />:null}</td>
                <td>
                    {container.state == "running" ? <Button onClick={()=>state.sendMessage({type: ACTION.DockerContainerStop, host: p.host, container: container.name})}>Stop</Button> : null}
                    {container.state != "running" ? <Button onClick={()=>state.sendMessage({type: ACTION.DockerContainerStart, host: p.host, container: container.name})}>Start</Button> : null}
                    <Button onClick={()=>{confirm("Delete this container from host?") && state.sendMessage({type: ACTION.DockerContainerRemove, host: p.host, container: container.name})}}>Remove</Button>
                    <Button onClick={()=>{confirm("Forget this container from host?") && state.sendMessage({type: ACTION.DockerContainerForget, host: p.host, container: container.name})}}>Forget</Button>
                    <Button onClick={(e)=>page.onClick(e, detailsPage)} href={page.link(detailsPage)}>Details</Button>
                    <Button onClick={(e)=>page.onClick(e, historyPage)} href={page.link(historyPage)}>History</Button>
                </td>
            </tr>
        )
    }

    let headers =  <tr>
        <th>Container</th>
        <th>Project</th>
        <th>Status</th>
        <th>Commit</th>
        <th>User</th>
        <th>Hash</th>
        <th>Start</th>
        <th>End</th>
        <td>Actions</td>
    </tr>;

    if (p.standalone)
        return (
            <Box title="Docker containers">
                <table className={classes.infoTable}>
                    <thead >
                       {headers}
                    </thead>
                    <tbody>
                        {rows}
                    </tbody>
                </table>
            </Box>);

    return <>
        <thead >
            <tr>
                <th colSpan={10} className={classes.infoTableHeader}>
                    {p.title || hostName}
                </th>
            </tr>
            {headers}
        </thead>
        <tbody>
            {rows}
        </tbody>
        </>;

}));

export const DockerContainers = withStyles(styles)(observer(function DockerContainers(p:{host?:string} & StyledComponentProps) {
    const classes = p.classes;
    if (!classes) return <Error>Missing p.classes</Error>;
    const dockerContainers = state.dockerContainers;
    if (!dockerContainers) return <Error>Missing state.dockerContainers</Error>;
    const r = extractRemote(dockerContainers.hosts);
    if (r.state != 'good') return r.error;
    const hosts = r.data;

    const lst = [];
    const keys = [];
    for (const key of hosts.keys())
        keys.push(key);
    keys.sort();

    for (const host of keys)
        lst.push(<HostDockerContainers key={host} host={host} standalone={false}/>)

    return <Box title="Docker containers">
         <table className={classes.infoTable}>
            {lst}
         </table>
        </Box>;
}));

export const DockerContainerDetails = withStyles(styles)(observer(function DockerContainerDetails(p:StyledComponentProps) {
    const spage = state.page;
    if (!spage) return <Error>Missing state.page</Error>;
    const page = spage.current;
    if (page.type != State.PAGE_TYPE.DockerContainerDetails) return <Error>Wrong page type</Error>;;
    const hosts = state.objectDigests.get(hostId);
    const host = hosts && hosts.get(page.host);
    const hostName = host && host.name;
    if (!hostName) return <Error>Missing host name</Error>;
    const dockerContainers = state.dockerContainers;
    if (!dockerContainers) return <Error>Missing dockerContainers</Error>;
    const ch = dockerContainers.containerHistory.get(page.host);
    const r = extractRemote(ch && ch.get(page.container));
    if (r.state != 'good') return r.error;
    const container = r.data.get(page.id);
    if (!container) return <Error>Missing container</Error>;

    let commit = "";
    const img = container.imageInfo;
    if (img && img.labels)
        commit = (img.labels.GIT_BRANCH || "") + " " + (img.labels.GIT_COMMIT || "");

    const now = +new Date()/1000;

    return <Box title={`Docker containers details: ${page.container}@${hostName}`}>
        <InformationList>
            <InformationListRow name="Project"><Typography>{container.image}</Typography></InformationListRow>
            <InformationListRow name="Deploy user"><Typography>{container.user}</Typography></InformationListRow>
            <InformationListRow name="Deploy start"><Typography>{container.start?<UnixTime time={container.start} />:null}</Typography></InformationListRow>
            <InformationListRow name="Deploy end"><Typography>{container.end?<UnixTime time={container.end} />:null}</Typography></InformationListRow>
            <InformationListRow name="Deploy state"><Typography>{container.state}</Typography></InformationListRow>
            <InformationListRow name="Push user"><Typography>{img?img.user:null}</Typography></InformationListRow>
            <InformationListRow name="Push time"><Typography>{img && img.time?<UnixTime time={img.time} />:null}</Typography></InformationListRow>
            <InformationListRow name="Push tag"><Typography>{img ? img.tag : null}</Typography></InformationListRow>
            <InformationListRow name="Build user"><Typography>{img ? img.labels.BUILD_USER : null}</Typography></InformationListRow>
            <InformationListRow name="Build host"><Typography>{img ? img.labels.BUILD_HOST : null}</Typography></InformationListRow>
            <InformationListRow name="Image hash"><Typography>{img ? img.hash : null}</Typography></InformationListRow>
            <InformationListRow name="Image Commit"><Typography>{commit}</Typography></InformationListRow>
            <InformationListRow name="Config"><Typography><pre>{container.config}</pre></Typography></InformationListRow>
        </InformationList>
    </Box>;
}));

export const DockerContainerHistory = withStyles(styles)(observer(function DockerContainerHistory(p: StyledComponentProps) {
    const classes = p.classes;
    if (!classes) return <Error>Missing classes</Error>;
    const s = state.dockerContainers;
    if (!s) return <Error>Missing state.dockerContainers</Error>;
    const spage = state.page;
    if (!spage) return <Error>Missing state.page</Error>;
    const page = spage.current;
    if (page.type != State.PAGE_TYPE.DockerContainerHistory) return <Error>Wrong page type</Error>;
    const hosts = state.objectDigests.get(hostId)
    const host = hosts && hosts.get(page.host);
    const hostName = host && host.name;
    if (!hostName) return <Error>Missing host name</Error>;;
    const ch = s.containerHistory.get(page.host);
    const r = extractRemote(ch && ch.get(page.container));
    if (r.state != 'good') return r.error;
    const history = r.data;

    let containers = [];
    for (const [id, c] of history)
        containers.push(c);

    containers.sort((a, b)=> {
        return a.id < b.id ? 1 : -1;
    });

    let rows = [];
    for (const container of containers) {
        let commit = "";
        if (container.imageInfo && container.imageInfo.labels) {
            commit = (container.imageInfo.labels.GIT_BRANCH || "") + " " + (container.imageInfo.labels.GIT_COMMIT || "");
        }
        const detailsPage: IPage = {type: State.PAGE_TYPE.DockerContainerDetails, host: page.host, container: container.name, id: container.id};
        rows.push(
            <tr key={container.id}>
                <td>{commit}</td>
                <td>{container.user}</td>
                <td>{container.hash}</td>
                <td>{container.start?<UnixTime time={container.start} />:null}</td>
                <td>{container.end?<UnixTime time={container.end} />:null}</td>
                <td>
                    <Button onClick={(e)=>spage.onClick(e, detailsPage)} href={spage.link(detailsPage)}>Details</Button>
                    <Button onClick={(event)=>nullCheck(state.dockerDeploy).deploy({host: page.host, container: container.name, image: container.image, config: container.config, event})} disabled={nullCheck(state.dockerDeploy).deploying}>Redeploy</Button>
                </td>
            </tr>
        )
    }
    return <Box title={`Docker containers history: ${page.container}@${hostName}`}>
        <table className={classes.infoTable}>
            <thead >
                <tr>
                    <th>Commit</th>
                    <th>User</th>
                    <th>Image</th>
                    <th>Start</th>
                    <th>End</th>
                    <td>Actions</td>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
         </table>
        </Box>;
}));

