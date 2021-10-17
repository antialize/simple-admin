import * as React from 'react';
import state from './state';
import { ACTION, ISearchRes } from './shared/actions';
import { observable, action, makeObservable } from 'mobx';
import { observer } from 'mobx-react';
import Box from './Box';
import { withStyles, StyledComponentProps } from "@material-ui/core/styles";
import styles from './styles'
import * as State from './shared/state'
import { IPage } from './shared/state';
import Button from '@material-ui/core/Button';
import Error from "./Error";
import nullCheck from "./shared/nullCheck"
import { Link, TextField } from '@material-ui/core';
import CircularProgress from "@material-ui/core/CircularProgress";


export class SearchState {
    constructor() {
        makeObservable(this)
    }

    @observable
    key: string = "";

    @observable
    searchKey: string = "";

    @observable.shallow
    objects: {type: number, id: number, version: number, name: string, comment: string, content: string}[] = [];

    @observable
    searching: boolean = false;

    @observable
    content: number | null = null;

    @action
    search() {
        this.objects = [];
        this.searchKey = this.key;
        this.searching = true;
        if (this.key) {
            state.sendMessage({type:ACTION.Search, ref: 0, pattern: "%"+this.key.replace(" ", "%") + "%"});
        }
    }

    @action
    handleSearch(res: ISearchRes) {
        this.searching = false;
        this.objects = res.objects;
    }
}

export const Search = withStyles(styles)(observer(function Search(p:StyledComponentProps) {
    let s = state.search;
    if (s == null) {
        return <Error>Missing state.searchState</Error>;
    }

    const page = state.page;
    if (page === null) return <span>Missing state.page</span>;

    let rows = [];
    for (const o of s.objects) {
        const type = state.types.get(o.type);
        const p: IPage = {type: State.PAGE_TYPE.Object, objectType: o.type, id: o.id};
        rows.push(
            <tr key={o.id}>
                <td>{type?type.name:o.type}</td>
                <td><Link color={"textPrimary" as any} onClick={(e)=>page.onClick(e, p)} href={page.link(p)}>{o.name}</Link></td>
                <td>{o.comment}</td>
                <td><Link color={"textPrimary" as any} onClick={(e)=>page.onClick(e, p)} href={page.link(p)}>{o.id}</Link></td>
                <td>{o.version}</td>
                <td>
                    {o.id !== s.content?<Button onClick={()=>nullCheck(s).content=o.id}>Show content</Button>:<Button onClick={()=>nullCheck(s).content=null}>Hide content</Button>}
                </td>
            </tr>
        );
        if (o.id === s.content) {
            rows.push(
                <tr><td colSpan={6}><pre style={{overflowX: "scroll", maxWidth: "96vw"}}>{JSON.stringify(JSON.parse(o.content), null, 2).replace(/\\n/g, "\n")}</pre></td></tr>
            )
        }
    }
    return <Box title="Search" expanded={true} collapsable={false}>
        <form action="javascript:void(0);" onSubmit={(e)=>{nullCheck(s).search(); e.preventDefault(); return false;}}>
            <TextField fullWidth={true} name="search" helperText="Search" value={s.key} onChange={(e)=>nullCheck(s).key=e.target.value}/>
        </form>
        {s.searching?<CircularProgress/>:null}
        {rows.length != 0?
        <table className={nullCheck(p.classes).infoTable}>
            <thead >
                <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Comment</th>
                    <th>Id</th>
                    <th>Version</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
        :null}
    </Box>;
}));

