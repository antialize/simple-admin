import * as React from 'react';
import state from './state';
import { ACTION, IDockerListDeploymentsRes, DockerDeployment, IDockerDeploymentsChanged } from '../../shared/actions';
import { observable, action } from 'mobx';
import { observer } from 'mobx-react';
import CircularProgress from "@material-ui/core/CircularProgress";
import Box from './Box';
import { withStyles, Theme, StyleRules, createStyles, StyledComponentProps } from "@material-ui/core/styles";
import { hostId } from '../../shared/type';
import Button from '@material-ui/core/Button';

export class DockerContainersState {
    @observable 
    loaded = false;
    
    loading = false;
    
    @observable
    hosts: Map<number, DockerDeployment[]> = new Map;


    load() {
        if (this.loading || this.loaded) return;
        this.loading = true;
        state.sendMessage({
            type: ACTION.DockerListDeployments,
            ref: 0
        });
    }

    @action
    handleLoad(act: IDockerListDeploymentsRes) {
        this.loading = false;
        this.loaded = true;
        for (const tag of act.deployments) {
            if (!this.hosts.has(tag.host))
                this.hosts.set(tag.host, []);
            this.hosts.get(tag.host).push(tag);
        }
    }

    @action
    handleChange(act: IDockerDeploymentsChanged) {
        for (const tag of act.changed) {
            if (!this.hosts.has(tag.host))
                this.hosts.set(tag.host, []);
            let found = false;
            let lst = this.hosts.get(tag.host);
            for (let i=0; i < lst.length; ++i) {
                if (lst[i].name != tag.name) continue;
                found = true;
                lst[i] = tag;
            }
            if (!found) lst.push(tag);
        }
        for (const tag of act.removed) {
            if (!this.hosts.has(tag.host)) continue;
            let lst = this.hosts.get(tag.host);
            this.hosts.set(tag.host, lst.filter((e) => e.name != tag.name));
        }
    }
};

const styles = (theme:Theme) : StyleRules => {
    return createStyles({
        table: {
            borderCollapse: 'collapse',
            borderWidth: 1,
            borderColor: theme.palette.background.default,
            borderStyle: 'solid',
            width: '100%',
            '& th' :{
                color: theme.palette.text.primary,
                borderWidth: 1,
                borderColor: theme.palette.background.default,
                borderStyle: 'solid',
            },
            "& tr" : {
                borderWidth: 1,
                borderColor: theme.palette.background.default,
                borderStyle: 'solid',
                color: theme.palette.text.primary,
                backgroundColor: theme.palette.background.paper,
            },
            "& td" : {
                borderWidth: 1,
                borderColor: theme.palette.background.default,
                borderStyle: 'solid',
                padding: 4
            },
            '& tr:nth-child(even)': {
                backgroundColor: theme.palette.background.default,
            }
        },
        });
}

export const HostDockerContainers = withStyles(styles)(observer(function DockerContainers(p:{host:number; title?:string} & StyledComponentProps) {
    const s = state.dockerContainers;
    s.load();
    if (!s.loaded) return null;
    if (!state.objectDigests.get(hostId).has(p.host)) return null;
    let hostName = state.objectDigests.get(hostId).get(p.host).name;
    if (!state.dockerContainers.hosts.has(p.host)) return null;
    let containers = state.dockerContainers.hosts.get(p.host).slice();
    containers.sort((a, b)=> {
        return a.name < b.name ? -1 : 1;
    });
 
    let rows = [];
    for (const container of containers) {
        let commit = "";
        if (container.imageInfo && container.imageInfo.labels) {
            commit = (container.imageInfo.labels.GIT_BRANCH || "") + " " + (container.imageInfo.labels.GIT_COMMIT || "");
        }
        rows.push(
            <tr>
                <td>{container.name}</td>
                <td>{container.image}</td>
                <td>{container.state || ""}</td>
                <td>{commit}</td>
                <td>{container.user}</td>
                <td>{container.imageInfo && container.imageInfo.user || ""}</td>
                <td>{container.hash? container.hash.substr(7,12) : ""}</td>
                <td>{new Date(container.start*1000).toISOString()}</td>
                <td>{container.end? new Date(container.start*1000).toISOString(): ""}</td>
                <td>
                    <Button>Log</Button>
                    <Button onClick={()=>state.sendMessage({type: ACTION.DockerContainerStop, host: p.host, container: container.name})}>Stop</Button>
                    <Button onClick={()=>state.sendMessage({type: ACTION.DockerContainerStart, host: p.host, container: container.name})}>Start</Button>
                    <Button onClick={()=>{confirm("Delete this container from host?") && state.sendMessage({type: ACTION.DockerContainerRemove, host: p.host, container: container.name})}}>Remove</Button>
                    <Button>Details</Button>
                </td>
            </tr>
        )
    }
    return <Box key={p.host} title={p.title || hostName} expanded={true} collapsable={true}>
        <table className={p.classes.table}>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Commit</th>
                    <th>Deploy user</th>
                    <th>Push user</th>
                    <th>Hash</th>
                    <th>Start</th>
                    <th>End</th>
                    <td>Actions</td>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
        </Box>
}));

export const DockerContainers = withStyles(styles)(observer(function DockerContainers(p:{host?:string} & StyledComponentProps) {
    const s = state.dockerContainers;
    s.load();
    if (!s.loaded)
        return <CircularProgress />;
    
    const lst = [];
    const keys = [];
    for (const key of state.dockerContainers.hosts.keys())
        keys.push(key);
    keys.sort();

    for (const host of keys) {
       lst.push(<HostDockerContainers host={host} />)
    }
    return <div>{lst}</div>;
}));

