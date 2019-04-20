import * as React from 'react';
import state from './state';
import { ACTION, IDockerListImageTagsRes, DockerImageTag, IDockerListDeploymentsRes, DockerDeployment } from '../../shared/actions';
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
        console.log("HI", act.deployments);
        for (const tag of act.deployments) {
            if (!this.hosts.has(tag.host))
                this.hosts.set(tag.host, []);
            this.hosts.get(tag.host).push(tag);
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
        rows.push(
            <tr>
                <td>{container.name}</td>
                <td>{container.image}</td>
                <td>{container.hash}</td>
                <td>{new Date(container.start*1000).toISOString()}</td>
                <td>{container.end? new Date(container.start*1000).toISOString(): ""}</td>
                <td>{container.user}</td>
                <td>Who knows?</td>
                <td>
                    <Button>Log</Button>
                    <Button>Stop</Button>
                    <Button>Start</Button>
                    <Button>Remove</Button>
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
                    <th>Hash</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>User</th>
                    <th>Status</th>
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

