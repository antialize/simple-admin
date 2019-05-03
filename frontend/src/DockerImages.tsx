import * as React from 'react';
import state from './state';
import { ACTION, IDockerListImageTagsRes, DockerImageTag, IDockerImageTagsCharged, IDockerListImageTagHistoryRes } from '../../shared/actions';
import { observable, action } from 'mobx';
import { observer } from 'mobx-react';
import CircularProgress from "@material-ui/core/CircularProgress";
import Box from './Box';
import { withStyles, Theme, StyleRules, createStyles, StyledComponentProps } from "@material-ui/core/styles";
import Switch from '@material-ui/core/Switch';
import styles from './styles'
import Remote from './Remote';
import * as State from '../../shared/state'
import { IPage } from '../../shared/state';
import Button from '@material-ui/core/Button';

export class DockerImagesState {
    @observable
    projects: Remote< Map<string, DockerImageTag[]> > = {state: 'initial'};

    @observable
    imageHistory: Map<string, Map<string, Remote< Map<number, DockerImageTag> >>> = new Map;

    @observable
    wtf: number = 0;

    getProjects() {
        switch (this.projects.state) {
        case 'initial':
            state.sendMessage({
                type: ACTION.DockerListImageTags,
                ref: 0
            });
            this.projects = {state: 'loading'}
            return null;
        case 'error':
            return null;
        case 'loading':
            return null;
        case 'data':
            return this.projects.data;
        }
    }

    getImageHistory(project:string, tag:string) {
        this.wtf;
        let h1 = this.imageHistory.get(project);
        if (!h1) {
            h1 = new Map();
            this.imageHistory.set(project, h1);
        }
        const h2 = h1.get(tag) || {state: 'initial'};
        console.log("Get image history", h2.state);
        switch (h2.state) {
        case 'initial':
            state.sendMessage({
                type: ACTION.DockerListImageTagHistory,
                ref: 0,
                image: project,
                tag
            });
            h1.set(tag, {state: 'loading'})
            return null;
        case 'error':
            return null;
        case 'loading':
            return null;
        case 'data':
            return h2.data;
        }
    }

    @action
    handleLoad(act: IDockerListImageTagsRes) {
        if (this.projects.state != 'data')
            this.projects = {state: 'data', data: new Map()};
        for (const tag of act.tags) {
            if (!this.projects.data.has(tag.image))
                this.projects.data.set(tag.image, []);
            this.projects.data.get(tag.image).push(tag);
        }
    }

    @action
    handleLoadHistory(act: IDockerListImageTagHistoryRes) {
        const h1 = this.imageHistory.get(act.image);
        if (!h1) return;
        const m : Map<number, DockerImageTag> = new Map();
        console.log("Handle load history")
        for (const i of act.images)
            m.set(i.id, i);
        h1.set(act.tag, {state: 'data', data: m});
        this.wtf += 1;
    }

    @action
    handleChange(act: IDockerImageTagsCharged) {
        if (this.projects.state == 'data') {
            const projects = this.projects.data;
            for (const tag of act.changed) {
                if (!projects.has(tag.image))
                    projects.set(tag.image, []);
                let lst = projects.get(tag.image);
                let found = false;
                for (let i=0; i < lst.length; ++i) {
                    if (lst[i].tag != tag.tag) continue;
                    lst[i] = tag;
                    found = true;
                }
                if (!found) lst.push(tag);
            }
            for (const tag of act.removed) {
                if (!projects.has(tag.image)) continue;
                let lst = projects.get(tag.image);
                projects.set(tag.image, lst.filter((e)=>{e.hash != tag.hash}));
            }
        }
        for (const tag of act.changed) {
            const h1 = this.imageHistory.get(tag.image);
            if (!h1) continue;
            const h2 = h1.get(tag.tag);
            if (!h2 || h2.state != 'data') continue
            h2.data.set(tag.id, tag);
        }
    }
};

export const DockerImages = withStyles(styles)(observer(function DockerImages(p:StyledComponentProps) {
    const projects = state.dockerImages.getProjects();
    if (!projects)
        return <CircularProgress />;
    const lst = [];
    const keys = [];
    for (const key of projects.keys())
        keys.push(key);
    keys.sort();

    for (const project of keys) {
        let tags = projects.get(project).slice();
        tags.sort((a, b)=> {
            return a.time - b.time;
        });
        let rows = [];
        for (const tag of tags) {
            let commit = "";
            if (tag.labels) {
                commit = (tag.labels.GIT_BRANCH || "") + " " + (tag.labels.GIT_COMMIT || "");
            }
            const historyPage: IPage = {type: State.PAGE_TYPE.DockerImageHistory, project: tag.image, tag: tag.tag};
            rows.push(
                <tr key={tag.tag}>
                    <td>{tag.tag}</td>
                    <td>{commit}</td>
                    <td>{tag.hash}</td>
                    <td>{new Date(tag.time*1000).toISOString()}</td>
                    <td>{tag.user}</td>
                    <td><Switch checked={tag.pin?true:false} onChange={(e)=>state.sendMessage({type:ACTION.DockerImageSetPin, id: tag.id, pin: e.target.checked})}/></td>
                    <td>
                        <Button onClick={(e)=>state.page.onClick(e, historyPage)} href={state.page.link(historyPage)}>History</Button>
                    </td>
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
                    <th>Actions</th>
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
    const s = state.dockerImages;
    const page = state.page.current;
    if (page.type != State.PAGE_TYPE.DockerImageHistory) return null;
    const history = s.getImageHistory(page.project, page.tag);
    if (!history)
        return <CircularProgress />;

    let images = [];
    for (const [id, c] of history)
        images.push(c);

    images.sort((a, b)=> {
        return a.id < b.id ? 1 : -1;
    });

    const now = +new Date()/1000;

    let rows = [];
    for (const image of images) {
        let commit = "";
        if (image.labels) {
            commit = (image.labels.GIT_BRANCH || "") + " " + (image.labels.GIT_COMMIT || "");
        }
        rows.push(
            <tr key={image.id}>
                <td>{commit}</td>
                <td>{image.hash}</td>
                <td>{new Date(image.time*1000).toISOString()}</td>
                <td>{image.user}</td>
                <td><Switch checked={image.pin?true:false} onChange={(e)=>state.sendMessage({type:ACTION.DockerImageSetPin, id: image.id, pin: e.target.checked})}/></td>
            </tr>
        );
    }

    return <Box title={`Docker image history: ${page.tag}@${page.project}`}>
        <table className={p.classes.infoTable}>
            <thead >
                <tr>
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
         </table>
        </Box>;
}));
