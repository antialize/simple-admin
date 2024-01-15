
import Box from './Box';
import * as State from './shared/state'
import { ACTION } from "./shared/actions";
import state from "./state";
import nullCheck from "./shared/nullCheck";
import Error from "./Error";
import {  Button, Switch } from "@mui/material";
import { IPage } from "./shared/state";
import UnixTime from "./UnixTime";
import React from "react";
import { observer } from 'mobx-react';
import extractRemote from './extractRemote';
import InfoTable, { InfoTableHeader } from './InfoTable';

export const DockerImages = observer(function DockerImages() {
    const dockerImages = state.dockerImages;
    if (!dockerImages) return <Error>Missing state.dockerImages</Error>;
    const r = extractRemote(dockerImages.projects);
    if (r.state != 'good') return r.error;
    const page = state.page;
    if (!page) return <Error>Missing state.page</Error>;

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
                    <InfoTableHeader colSpan={10}>
                        {project}
                    </InfoTableHeader>
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
        <InfoTable>
            {lst}
        </InfoTable>
        </Box>;
});

export const DockerImageHistory = observer(function DockerImageHistory() {
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
    for (const [_, c] of history)
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
        <InfoTable>
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
         </InfoTable>
        </Box>;
});
