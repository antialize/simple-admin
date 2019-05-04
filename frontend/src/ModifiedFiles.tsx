import * as React from 'react';
import state from './state';
import { observable, action } from 'mobx';
import { ACTION, ModifiedFile, IModifiedFilesChanged } from '../../shared/actions';
import { observer } from 'mobx-react';
import { StyleRules, createStyles, StyledComponentProps, withStyles, Theme } from '@material-ui/core/styles';
import CircularProgress from "@material-ui/core/CircularProgress";
import Box from './Box';
import Button from '@material-ui/core/Button';
import { hostId, typeId } from '../../shared/type';
import { PAGE_TYPE, IModifiedFilePage } from '../../shared/state';
import * as Diff from 'diff';
import Editor from './Editor';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import { number } from 'prop-types';
import Remote from './Remote';
import extractRemote from './extractRemote';

export class ModifiedFilesState {
    @observable
    modifiedFiles: Remote< Map<number, ModifiedFile> > = {state: 'initial'};

    @observable
    scanning: boolean;

    @observable
    lastScanTime: number;

    @observable
    saveTime: number = null;


    private saveInterval: any = null;

    load() {
        if (this.modifiedFiles.state != 'initial') return;
        state.sendMessage({
            type: ACTION.ModifiedFilesList
        });
        this.modifiedFiles = {state: 'loading'};
    }

    @action
    handleChange(act : IModifiedFilesChanged) {
        if (act.full)
            this.modifiedFiles = {state: 'data', data: new Map()};
        if (this.modifiedFiles.state != 'data')
            return;
        this.scanning = act.scanning;
        this.lastScanTime = act.lastScanTime;
        for (const id of act.removed)
            this.modifiedFiles.data.delete(id);
        for (const f of act.changed) 
            this.modifiedFiles.data.set(f.id, f);
    }

    scan() {
        state.sendMessage({
            type: ACTION.ModifiedFilesScan
        });
    }

    revert(id:number) {
        if (!confirm("Are you sure you want to revert the file on the remote host?")) return;
        state.sendMessage({
            type: ACTION.ModifiedFilesResolve,
            id,
            action: "redeploy",
            newCurrent: null
        });
        state.page.set({type: PAGE_TYPE.ModifiedFiles});
    }

    save(id:number, newCurrent:string) {
        if (!newCurrent) return;
        if (this.modifiedFiles.state != 'data') return;
        if (!confirm("Are you sure you want save the current object?")) return;
        state.sendMessage({
            type: ACTION.ModifiedFilesResolve,
            id,
            action: "updateCurrent",
            newCurrent
        });
        const f = this.modifiedFiles.data.get(id);
        this.saveTime = 10;

        this.saveInterval = setInterval(()=>{
            --this.saveTime;
            if (this.saveTime > 0) return;
            clearInterval(this.saveInterval);
            state.page.set({type: PAGE_TYPE.Object, objectType: f.type, id: f.object, version: null});
            this.saveTime = null;
            this.saveInterval = null;
        }, 500);
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
        scan: {
            marginLeft: 20,
            color: theme.palette.text.primary,
            fontSize: "120%"
        }
        });
};

@observer
export class ModifiedFileRevolver extends React.Component<{id:number}, {content:string, patch:boolean, lang: string}> {
    constructor(props: {id:number}) {
        super(props);
        this.state = {content: null, patch:true, lang: ""}
    }

    render() {
        const s = state.modifiedFiles;
        const r = extractRemote(s.modifiedFiles);
        if (r.state != 'good') return r.error;
        const o = r.data.get(this.props.id);
        if (!o) return <span>Not found</span>;
        const current = o.current || "";
        const content = this.state.content === null?current:this.state.content;
        const patch = Diff.createPatch(o.path, o.deployed, o.actual || "", "","");
        const patched = Diff.applyPatch(content, patch);
        return <div className="modified_container">
            <div style={{gridArea: "head"}}>
                <Typography component="span" style={{display:"inline"}}>Show diff: </Typography>
                <Switch checked={this.state.patch} onChange={(e)=>this.setState({patch: e.target.checked})} />
                &nbsp;&nbsp;
                <Button variant="contained" disabled={current == content} onClick={()=>this.setState({content: current})}>Reset</Button>
                &nbsp;&nbsp;
                <Button disabled={!patched} variant="contained" onClick={()=>{this.setState({content: patched})}}>Apply patch</Button>
                &nbsp;&nbsp;
                <Button variant="contained" color="secondary" onClick={()=>s.revert(this.props.id)}>Revert changes on host</Button>
                &nbsp;&nbsp;
                <Button variant="contained" color="primary" disabled={current == content} onClick={()=>s.save(this.props.id, content)}>{s.saveTime?"Wait "+s.saveTime:"Save changes"}</Button>
            </div>
            {
                this.state.patch
                ? <div style={{gridArea: "lt / lb"}}> <Editor lang={"diff"} fixedLang={true} title="Diff" data={patch} readOnly={true}/> </div>
                : <>
                    <div className="modified_half" style={{gridArea: "lt"}}><Editor lang={this.state.lang} setLang={(lang)=>this.setState({lang})} fixedLang={false} title="Deployed" data={o.deployed} readOnly={true}/></div>
                    <div className="modified_half" style={{gridArea: "lb"}}><Editor lang={this.state.lang} setLang={(lang)=>this.setState({lang})} fixedLang={false} title="Current" data={o.actual || ""} readOnly={true}/></div>
                </>
            }
            <div style={{gridArea: "right"}}>
                <Editor lang={this.state.lang} setLang={(lang)=>this.setState({lang})} fixedLang={false} title="Deployed" data={content} setData={(d)=>this.setState({content: d})}/>
            </div>
            </div>;
    }
};

export const ModifiedFiles = withStyles(styles)(observer(function ModifiedFiles(p: StyledComponentProps) {
    const s = state.modifiedFiles;
    const r = extractRemote(s.modifiedFiles);
    if (r.state != 'good') return r.error;
    let rows = [];
    for (const [id, f] of r.data) {
        const oo = state.objectDigests.get(f.type);
        const a : IModifiedFilePage = {type: PAGE_TYPE.ModifiedFile, id: id};
        rows.push(<tr key={id}>
            <td>{state.objectDigests.get(hostId).get(f.host).name}</td>
            <td>{state.types.has(f.type) ? state.types.get(f.type).name : f.type}</td>
            <td>{f.path}</td>
            <td>{oo && oo.has(f.object)?oo.get(f.object).name:f.object}</td>
            <td><Button onClick={(e) => state.page.onClick(e, a)} href={state.page.link(a)}>Details</Button></td>
            </tr>);
    }
    return <Box title="Modified Files" expanded={true} collapsable={false}>
            {s.scanning
                ?<div><CircularProgress /><span className={p.classes.scan}>Scanning</span></div>
                :<div><Button variant="contained" onClick={()=>s.scan()}>scan</Button><span className={p.classes.scan}>Last scan: {new Date(s.lastScanTime*1000).toISOString()}</span></div>
            }
            <table className={p.classes.table}>
                <thead>
                    <tr>
                        <th>Host</th>
                        <th>Type</th>
                        <th>Path</th>
                        <th>Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </Box>;

}));
