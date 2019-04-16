import * as React from 'react';
import state from './state';
import { ACTION, IDockerListImageTagsRes, DockerImageTag } from '../../shared/actions';
import { observable, action } from 'mobx';
import { observer } from 'mobx-react';
import CircularProgress from "@material-ui/core/CircularProgress";
import Box from './Box';
import Typography from '@material-ui/core/Typography';
import { withStyles, Theme, StyleRules, createStyles, StyledComponentProps } from "@material-ui/core/styles";

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

