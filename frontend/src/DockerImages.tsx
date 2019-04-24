import * as React from 'react';
import state from './state';
import { ACTION, IDockerListImageTagsRes, DockerImageTag, IDockerImageTagsCharged } from '../../shared/actions';
import { observable, action } from 'mobx';
import { observer } from 'mobx-react';
import CircularProgress from "@material-ui/core/CircularProgress";
import Box from './Box';
import { withStyles, Theme, StyleRules, createStyles, StyledComponentProps } from "@material-ui/core/styles";
import Switch from '@material-ui/core/Switch';


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
            rows.push(
                <tr>
                    <td>{tag.tag}</td>
                    <td>{tag.hash}</td>
                    <td>{new Date(tag.time*1000).toISOString()}</td>
                    <td>{tag.user}</td>
                    <td><Switch checked={tag.pin} onChange={(e)=>state.sendMessage({type:ACTION.DockerImageSetPin, image: tag.image, hash: tag.hash, pin: e.target.checked})}/></td>
                </tr>
            )
        }
        lst.push(<Box key={project} title={project} expanded={true} collapsable={true}>
            <table className={p.classes.table}>
                <thead>
                    <tr>
                        <th>Tag</th>
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
            </Box>);
    }
    return <div>{lst}</div>;
}));

