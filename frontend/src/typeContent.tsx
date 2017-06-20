import * as React from "react";
import Toggle from 'material-ui/Toggle';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import TextField from 'material-ui/TextField';
import {IType, ITypeProp, TypePropType, hostId, typeId, rootId} from '../../shared/type'

export function TypeContent(p: {content: ITypeProp[], onChange: (v: ITypeProp[])=>void}) {
    let rows = [];
    let c = p.content.slice(0);
    c.push({type: TypePropType.none});

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
        if (r.type == TypePropType.none || r.type == TypePropType.typeContent || r.type == TypePropType.monitorContent || r.type == TypePropType.document || r.type == TypePropType.password)
            def = <TextField value="" disabled={true}/>;
        else if (r.type == TypePropType.bool) {
            def = (
                <SelectField value={!!r.default} onChange={(a, b, value) => change({default: value})}>
                    <MenuItem value={true} primaryText="On" />
                    <MenuItem value={false} primaryText="Off" />
                </SelectField>
            );
        } else if (r.type == TypePropType.choice) {
            def = (
                <SelectField value={r.default || ""} onChange={(a, b, value) => change({default: value})} disabled={!r.choices || r.choices.length == 0}>
                    {(r.choices || [""]).map(v=> <MenuItem value={v} primaryText={v} key={v}/> )}
                </SelectField>
            );
        } else {
            def = <TextField value={r.default} onChange={(a,value)=>change({default: value})}/>;
        }
        let temp;
        if (r.type == TypePropType.text || r.type == TypePropType.document) 
            temp = <Toggle key="template" toggled={r.template} onToggle={(a,value)=>change({template: value})}/>;
        else
            temp = <Toggle key="template" toggled={false} disabled={true}/>;
        let var_;
        if (r.type == TypePropType.text || r.type == TypePropType.choice || r.type == TypePropType.bool || r.type == TypePropType.document)
            var_ = <TextField key="var" value={r.variable} onChange={(a, value) => change({variable: value})}/>;
        else
            var_ = <TextField key="var" value="" disabled={true} />;
        let extra = null;
        if (r.type == TypePropType.choice)
            extra = <TextField hintText="Choices" value={((r.choices) || []).join(", ").trim()} onChange={(a, value) => change({choices: value.split(",").map(v=>v.trim())})}/>;
        else if (r.type == TypePropType.document)
            extra = <span>
                <TextField key="langname" hintText="LangName" value={r.langName || ""} onChange={(a, value) => change({langName: value})}/>
                <TextField key="lang" hintText="Lang" value={r.lang || ""} onChange={(a, value) => change({lang: value})}/>
                </span>;
        else if (r.type == TypePropType.text)
            extra = (
                <span style={{verticalAlign:"middle"}}>
                    <SelectField hintText="Size" value={r.lines || 0} onChange={(a,b,value) => change({lines: value})} style={{width:"120px", display:'inline-block', verticalAlign:"middle"}}>
                        <MenuItem key={0} value={0} primaryText="Normal" />
                        <MenuItem key={1} value={1} primaryText="1 Line" />
                        <MenuItem key={2} value={2} primaryText="2 Lines" />
                        <MenuItem key={3} value={3} primaryText="3 Lines" />
                        <MenuItem key={4} value={4} primaryText="4 Lines" />
                        <MenuItem key={5} value={5} primaryText="5 Lines" />
                    </SelectField>
                    <Toggle key="deploytitle" toggled={r.deployTitle} onToggle={(a,value)=>change({deployTitle: value})} label="Deploy title" labelPosition="right" style={{width:"120px", display:'inline-block', verticalAlign:"middle"}} />
                </span>)

        rows.push(
            <tr key={i}>
                <td>
                    <SelectField value={r.type} onChange={(a, b, value) => changeType(value)}>
                        <MenuItem value={TypePropType.bool} primaryText="Bool" />
                        <MenuItem value={TypePropType.text} primaryText="Text" />
                        <MenuItem value={TypePropType.password} primaryText="Password" />
                        <MenuItem value={TypePropType.document} primaryText="Document" />
                        <MenuItem value={TypePropType.choice} primaryText="Choice" />
                        <MenuItem value={TypePropType.typeContent} primaryText="Type Content" />
                        <MenuItem value={TypePropType.monitorContent} primaryText="Monitor Content" />
                        <MenuItem value={TypePropType.none} primaryText="Nothing" />
                    </SelectField>
                </td>
                <td><TextField value={r.type != TypePropType.none && r.name || ""} disabled={r.type == TypePropType.none} onChange={(a, value) => change({name: value})}/></td>
                <td><TextField value={r.type != TypePropType.none && r.type != TypePropType.typeContent && r.type != TypePropType.monitorContent && r.title || ""} disabled={r.type == TypePropType.none || r.type == TypePropType.typeContent || r.type == TypePropType.monitorContent} onChange={(a, value) => change({title: value})}/></td>
                <td>{def}</td>
                <td>{temp}</td>
                <td>{var_}</td>
                <td><TextField value={r.type != TypePropType.none && r.type != TypePropType.typeContent && r.type != TypePropType.monitorContent  && r.description || ""} disabled={r.type == TypePropType.none || r.type == TypePropType.typeContent || r.type == TypePropType.monitorContent} onChange={(a, value) => change({description: value})}/></td>
                <td>{extra}</td>
            </tr>);
    }

    return (
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Default</th>
                    <th>Template</th>
                    <th>Variable</th>
                    <th>Description</th>
                    <th>Extra</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>);
}

export default TypeContent;