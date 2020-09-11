import * as React from "react";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import MenuItem from "@material-ui/core/MenuItem";
import Select from "@material-ui/core/Select";
import Switch from "@material-ui/core/Switch";
import TextField from "@material-ui/core/TextField";
import { ITypeProp, TypePropType } from '../../shared/type';
import { StyleRules, withStyles, createStyles, StyledComponentProps } from "@material-ui/core/styles";
import { Theme } from "@material-ui/core";
import nullCheck from '../../shared/nullCheck';

const styles = (theme:Theme) : StyleRules => {
    return createStyles({
        th: {
            color: theme.palette.text.primary
        },
        td: {
            color: theme.palette.text.primary
        },
        tr: {
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary
        }});
}

function TypeContentImpl(p: {content: ITypeProp[], onChange: (v: ITypeProp[])=>void} & StyledComponentProps) {
    let rows = [];
    let c = p.content.slice(0);
    c.push({type: TypePropType.none});
    const classes = nullCheck(p.classes);

    for (let i = 0; i < c.length; ++i) {
        const r = c[i];
        if (r.type == TypePropType.none && i +1 != c.length) continue;

        const changeType = (type: TypePropType) => {
            if (r && type == r.type) return;
            c[i] = {type} as ITypeProp;
            p.onChange(c);
        };

        const change = (o:{[key:string]:any}) => {
            c[i] = Object.assign({}, r || {}, o) as ITypeProp;
            p.onChange(c.filter(c=>c.type != TypePropType.none));
        };
        let def;
        if (r.type == TypePropType.none || r.type == TypePropType.typeContent || r.type == TypePropType.document || r.type == TypePropType.password)
            def = <TextField value="" disabled={true}/>;
        else if (r.type == TypePropType.bool) {
            def = (
                <Select value={r.default?1:0} onChange={(e) => change({default: e.target.value?true:false})}>
                    <MenuItem value={1}>On</MenuItem>
                    <MenuItem value={0}>Off</MenuItem>
                </Select>
            );
        } else if (r.type == TypePropType.choice) {
            def = (
                <Select value={r.default || ""} onChange={(e) => change({default: e.target.value})} disabled={!r.choices || r.choices.length == 0}>
                    {(r.choices || [""]).map(v=> <MenuItem value={v} key={v}>{v}</MenuItem> )}
                </Select>
            );
        } else {
            def = <TextField value={r.default} onChange={(e)=>change({default: e.target.value})}/>;
        }
        let temp;
        if (r.type == TypePropType.text || r.type == TypePropType.document) 
            temp = <Switch key="template" checked={r.template} onChange={(e)=>change({template: e.target.checked})}/>;
        else
            temp = <Switch key="template" checked={false} disabled={true}/>;
        let var_;
        if (r.type == TypePropType.text || r.type == TypePropType.choice || r.type == TypePropType.bool || r.type == TypePropType.document)
            var_ = <TextField key="var" value={r.variable} onChange={(e) => change({variable: e.target.value})}/>;
        else
            var_ = <TextField key="var" value="" disabled={true} />;
        let extra = null;
        if (r.type == TypePropType.choice)
            extra = <TextField value={((r.choices) || []).join(", ").trim()} onChange={(e) => change({choices: e.target.value.split(",").map(v=>v.trim())})}/>;
        else if (r.type == TypePropType.document)
            extra = <span>
                <TextField key="langname" value={r.langName || ""} onChange={(e) => change({langName: e.target.value})}/>
                <TextField key="lang" value={r.lang || ""} onChange={(e) => change({lang: e.target.value})}/>
                </span>;
        else if (r.type == TypePropType.text)
            extra = (
                <span style={{verticalAlign:"middle"}}>
                    <Select value={r.lines || 0} onChange={(e) => change({lines: +(e.target.value as any)})} style={{width:"120px", display:'inline-block', verticalAlign:"middle"}}> // hintText="Size"
                        <MenuItem key={0} value={0}>Normal</MenuItem>
                        <MenuItem key={1} value={1}>1 Line</MenuItem>
                        <MenuItem key={2} value={2}>2 Lines</MenuItem>
                        <MenuItem key={3} value={3}>3 Lines</MenuItem>
                        <MenuItem key={4} value={4}>4 Lines</MenuItem>
                        <MenuItem key={5} value={5}>5 Lines</MenuItem>
                    </Select>
                    <FormControlLabel
                        label="Deploy title"
                        labelPlacement="end"
                        control={
                            <Switch key="deploytitle" checked={r.deployTitle} onChange={(e)=>change({deployTitle: e.target.checked})} style={{width:"120px", display:'inline-block', verticalAlign:"middle"}} />
                        }/>
                </span>)

        rows.push(
            <tr key={i}>
                <td>
                    <Select value={r.type} onChange={(e) => changeType(+(e.target.value as any))}>
                        <MenuItem value={TypePropType.bool}>Bool</MenuItem>
                        <MenuItem value={TypePropType.text}>Text</MenuItem>
                        <MenuItem value={TypePropType.password}>Password</MenuItem>
                        <MenuItem value={TypePropType.document}>Document</MenuItem>
                        <MenuItem value={TypePropType.choice}>Choice</MenuItem>
                        <MenuItem value={TypePropType.typeContent}>Type Content</MenuItem>
                        <MenuItem value={TypePropType.none}>Nothing</MenuItem>
                    </Select>
                </td>
                <td><TextField value={r.type != TypePropType.none && r.name || ""} disabled={r.type == TypePropType.none} onChange={(e) => change({name: e.target.value})}/></td>
                <td><TextField value={r.type != TypePropType.none && r.type != TypePropType.typeContent && r.title || ""} disabled={r.type == TypePropType.none || r.type == TypePropType.typeContent} onChange={(e) => change({title: e.target.value})}/></td>
                <td className={classes.td}>{def}</td>
                <td className={classes.td}>{temp}</td>
                <td className={classes.td}>{var_}</td>
                <td><TextField value={r.type != TypePropType.none && r.type != TypePropType.typeContent  && r.description || ""} disabled={r.type == TypePropType.none || r.type == TypePropType.typeContent} onChange={(e) => change({description: e.target.value})}/></td>
                <td className={classes.td}>{extra}</td>
            </tr>);
    }

    return (
        <table>
            <thead>
                <tr>
                    <th className={classes.th}>Type</th>
                    <th className={classes.th}>Name</th>
                    <th className={classes.th}>Title</th>
                    <th className={classes.th}>Default</th>
                    <th className={classes.th}>Template</th>
                    <th className={classes.th}>Variable</th>
                    <th className={classes.th}>Description</th>
                    <th className={classes.th}>Extra</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>);
}

const TypeContent = withStyles(styles)(TypeContentImpl);
export default TypeContent;

