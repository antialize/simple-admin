import * as React from 'react';
import state from './state';
import { ACTION, IDockerListImageTagsRes, DockerImageTag, IDockerImageTagsCharged } from '../../shared/actions';
import { observable, action } from 'mobx';
import { observer } from 'mobx-react';
import CircularProgress from "@material-ui/core/CircularProgress";
import Box from './Box';
import { withStyles, Theme, StyleRules, createStyles, StyledComponentProps } from "@material-ui/core/styles";
import Switch from '@material-ui/core/Switch';
import styles from './styles'

export class DockerImagesState {
    @observable 
    loaded = false;
    
    loading = false;
    
    @observable
    projects: Map<string, DockerImageTag[]> = new Map;

    load() {
        if (this.loading || this.loaded) return;
        this.loading = true;
        state.sendMessage({
            type: ACTION.DockerListImageTags,
            ref: 0
        });
    }

    @action
    handleLoad(act: IDockerListImageTagsRes) {
        this.loading = false;
        this.loaded = true;
        for (const tag of act.tags) {
            if (!this.projects.has(tag.image))
                this.projects.set(tag.image, []);
            this.projects.get(tag.image).push(tag);
        }
    }

    @action
    handleChange(act: IDockerImageTagsCharged) {
        for (const tag of act.changed) {
            if (!this.projects.has(tag.image))
                this.projects.set(tag.image, []);
            let lst = this.projects.get(tag.image);
            let found = false;
            for (let i=0; i < lst.length; ++i) {
                if (lst[i].tag != tag.tag) continue;
                lst[i] = tag;
                found = true;
            }
            if (!found) lst.push(tag);
        }
        for (const tag of act.removed) {
            if (!this.projects.has(tag.image)) continue;
            let lst = this.projects.get(tag.image);
            this.projects.set(tag.image, lst.filter((e)=>{e.hash != tag.hash}));
        }
    }
};

export const DockerImages = withStyles(styles)(observer(function DockerImages(p:StyledComponentProps) {
    state.dockerImages.load();
    if (!state.dockerImages.loaded)
        return <CircularProgress />;
    const lst = [];
    const keys = [];
    for (const key of state.dockerImages.projects.keys())
        keys.push(key);
    keys.sort();

    for (const project of keys) {
        let tags = state.dockerImages.projects.get(project).slice();
        tags.sort((a, b)=> {
            return a.time - b.time;
        });
        let rows = [];
        for (const tag of tags) {
            let commit = "";
            if (tag.labels) {
                commit = (tag.labels.GIT_BRANCH || "") + " " + (tag.labels.GIT_COMMIT || "");
            }
            rows.push(
                <tr key={tag.tag}>
                    <td>{tag.tag}</td>
                    <td>{commit}</td>
                    <td>{tag.hash}</td>
                    <td>{new Date(tag.time*1000).toISOString()}</td>
                    <td>{tag.user}</td>
                    <td><Switch checked={tag.pin?true:false} onChange={(e)=>state.sendMessage({type:ACTION.DockerImageSetPin, image: tag.image, hash: tag.hash, pin: e.target.checked})}/></td>
                </tr>
            );
        }
        lst.push(<React.Fragment key={project}>
            <thead>
                <tr>
                    <th colSpan={10} className={p.classes.infoTableHeader}>
                        {project}
                    </th>
                </tr>
                <tr>
                    <th>Tag</th>
                    <th>Commit</th>
                    <th>Hash</th>
                    <th>Created</th>
                    <th>User</th>
                    <th>Pin</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
            </React.Fragment>)
    }
    return <Box title={"Docker images"} expanded={true} collapsable={false}>
        <table className={p.classes.infoTable}>
            {lst}
        </table>
        </Box>;
    return <div>{lst}</div>;
}));

export const DockerImageHistory = withStyles(styles)(observer(function DockerImageHistory(p:StyledComponentProps) {
    return <div>Todo</div>;
}));
