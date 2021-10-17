import * as React from 'react';
import state from './state';
import { ACTION, IDockerListImageTagsRes, DockerImageTag, IDockerImageTagsCharged, IDockerListImageTagHistoryRes, IDockerImageTagSetPin } from '../../shared/actions';
import { observable, action, makeObservable } from 'mobx';
import { observer } from 'mobx-react';
import Box from './Box';
import { withStyles, StyledComponentProps } from "@material-ui/core/styles";
import Switch from '@material-ui/core/Switch';
import styles from './styles'
import Remote from './Remote';
import extractRemote from "./extractRemote";
import * as State from '../../shared/state'
import { IPage } from '../../shared/state';
import Button from '@material-ui/core/Button';
import getOrInsert from '../../shared/getOrInsert';
import Error from "./Error";
import nullCheck from "../../shared/nullCheck"
import UnixTime from './UnixTime';

export class DockerImagesState {
    constructor() {
        makeObservable(this)
    }
    
    @observable
    show_all: boolean = false;

    @observable
    projects: Remote< Map<string, DockerImageTag[]> > = {state: 'initial'};

    @observable
    imageHistory: Map<string, Map<string, Remote< Map<number, DockerImageTag> >>> = new Map;

    @observable
    imageTagPin: Set<String> = new Set; //Key is image + ":" + tag

    load() {
        if (this.projects.state != 'initial') return;
        state.sendMessage({
            type: ACTION.DockerListImageTags,
            ref: 0
        });
        this.projects = {state: 'loading'};
    }

    @action
    setPinnedImageTags(pit: {image: string, tag:string}[]) {
        for (const {image, tag} of pit)
            this.imageTagPin.add(image+":"+tag);
    }

    @action
    loadImageHistory(project:string, tag:string) {
        let h1 = this.imageHistory.get(project);
        if (!h1) {
            h1 = new Map();
            this.imageHistory.set(project, h1);
        }
        let h2 = h1.get(tag);
        if (h2 && h2.state != 'initial') return;
        state.sendMessage({
            type: ACTION.DockerListImageTagHistory,
            ref: 0,
            image: project,
            tag
        });
        h1.set(tag, {state: 'loading'})
    }

    @action
    handleLoad(act: IDockerListImageTagsRes) {
        if (this.projects.state != 'data')
            this.projects = {state: 'data', data: new Map()};
        for (const tag of act.tags) {
            getOrInsert(this.projects.data, tag.image, ()=>[]).push(tag);
        }

        const pit = act.pinnedImageTags;
        if (pit != null)
            nullCheck(state.dockerImages).setPinnedImageTags(pit);
    }

    @action
    handleLoadHistory(act: IDockerListImageTagHistoryRes) {
        const h1 = this.imageHistory.get(act.image);
        if (!h1) return;
        const m : Map<number, DockerImageTag> = new Map();
        for (const i of act.images)
            m.set(i.id, i);
        h1.set(act.tag, {state: 'data', data: m});
    }

    @action
    handleChange(act: IDockerImageTagsCharged) {
        if (this.projects.state == 'data') {
            const projects = this.projects.data;
            for (const tag of act.changed) {
                let lst = getOrInsert(projects, tag.image, ()=>[])
                let found = false;
                for (let i=0; i < lst.length; ++i) {
                    if (lst[i].tag != tag.tag) continue;
                    lst[i] = tag;
                    found = true;
                }
                if (!found) lst.push(tag);
            }
            for (const tag of act.removed) {
                let lst = projects.get(tag.image);
                if (lst === undefined) continue;
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
        const c = act.imageTagPinChanged;
        if (c) {
            for (const {image, tag, pin} of c) {
                if (pin)
                    this.imageTagPin.add(image+":"+tag);
                else
                    this.imageTagPin.delete(image+":"+tag);
            }
        }
    }
};

export const DockerImages = withStyles(styles)(observer(function DockerImages(p:StyledComponentProps) {
    const dockerImages = state.dockerImages;
    if (!dockerImages) return <Error>Missing state.dockerImages</Error>;
    const r = extractRemote(dockerImages.projects);
    if (r.state != 'good') return r.error;
    const page = state.page;
    if (!page) return <Error>Missing state.page</Error>;
    const classes = p.classes;
    if (!classes) return <Error>Missing classes</Error>;

    const projects = r.data;
    const lst = [];
    const keys = [];
    for (const key of projects.keys())
        keys.push(key);
    keys.sort();

    for (const project of keys) {
        let tags = nullCheck(projects.get(project)).slice();
        tags.sort((a, b)=> {
            return a.time - b.time;
        });
        let rows = [];
        for (const tag of tags) {
            if (tag.removed && !dockerImages.show_all) continue;
            let commit = "";
            if (tag.labels) {
                commit = (tag.labels.GIT_BRANCH || "") + " " + (tag.labels.GIT_COMMIT || "");
            }
            const historyPage: IPage = {type: State.PAGE_TYPE.DockerImageHistory, project: tag.image, tag: tag.tag};
            let pin = dockerImages.imageTagPin.has(project + ":" + tag.tag);
            rows.push(
                <tr className={tag.removed?"disabled":undefined} key={tag.id}>
                    <td>{tag.tag}</td>
                    <td>{commit}</td>
                    <td>{tag.hash}</td>
                    <td><UnixTime time={tag.time} /></td>
                    <td>{tag.user}</td>
                    <td>{
                        tag.removed
                        ? <UnixTime time={tag.removed} />
                        : <Switch title="Pin image with given hash" checked={tag.pin?true:false} onChange={(e)=>state.sendMessage({type:ACTION.DockerImageSetPin, id: tag.id, pin: e.target.checked})} />
                        }
                        <Switch title="Pin the latest image with given tag" checked={pin?true:false} onChange={(e)=>state.sendMessage({type:ACTION.DockerImageTagSetPin, image: project, tag: tag.tag, pin: e.target.checked})} />
                    </td>
                    <td>
                        <Button onClick={(e)=>page.onClick(e, historyPage)} href={page.link(historyPage)}>History</Button>
                    </td>
                </tr>
            );
        }
        if (!rows) continue;
        lst.push(<React.Fragment key={project}>
            <thead>
                <tr>
                    <th colSpan={10} className={classes.infoTableHeader}>
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
    let title = <React.Fragment>Docker images<span style={{width: "100px", display: "inline-block"}}/>Show all: <Switch title="All" checked={dockerImages.show_all} onChange={(e)=>dockerImages.show_all = e.target.checked}/></React.Fragment>;
    return <Box title={title} expanded={true} collapsable={false}>
        <table className={classes.infoTable}>
            {lst}
        </table>
        </Box>;
}));

export const DockerImageHistory = withStyles(styles)(observer(function DockerImageHistory(p:StyledComponentProps) {
    const s = state.dockerImages;
    if (!s) return <Error>Missing state.dockerImages</Error>;
    const spage = state.page;
    if (!spage) return <Error>Missing state.page</Error>;
    const page = spage.current;
    if (page.type != State.PAGE_TYPE.DockerImageHistory) return <Error>Wrong page</Error>;

    let h1 = s.imageHistory.get(page.project);
    const r = extractRemote(h1 && h1.get(page.tag));
    if (r.state != 'good') return r.error;
    const history = r.data;
    let images = [];
    for (const [id, c] of history)
        images.push(c);

    images.sort((a, b)=> {
        return a.id < b.id ? 1 : -1;
    });

    let rows = [];
    for (const image of images) {
        let commit = "";
        if (image.labels) {
            commit = (image.labels.GIT_BRANCH || "") + " " + (image.labels.GIT_COMMIT || "");
        }
        rows.push(
            <tr className={image.removed?"disabled":undefined} key={image.id}>
                <td>{commit}</td>
                <td>{image.hash}</td>
                <td><UnixTime time={image.time} /></td>
                <td>{image.user}</td>
                <td>
                    {image.removed
                    ? <UnixTime time={image.removed} />
                    : <Switch checked={image.pin?true:false} onChange={(e)=>state.sendMessage({type:ACTION.DockerImageSetPin, id: image.id, pin: e.target.checked})} />
                    }
                </td>
            </tr>
        );
    }

    return <Box title={`Docker image history: ${page.tag}@${page.project}`}>
        <table className={nullCheck(p.classes).infoTable}>
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
