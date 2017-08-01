import * as React from "react";
import Toggle from 'material-ui/Toggle';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import TextField from 'material-ui/TextField';

import {IMonitor, IMonitorProp, MonitorPropType, MonitorUnit} from '../../shared/monitor'


export function MonitorContent(p: {content: IMonitorProp[], onChange: (v: IMonitorProp[])=>void}) {
    let rows = [];
    let c = p.content.slice(0);
    c.push({type: MonitorPropType.none});

    for (let i = 0; i < c.length; ++i) {
        const r = c[i];
        if (r.type == MonitorPropType.none && i +1 != c.length) continue;

        const changeType = (type: MonitorPropType) => {
            if (r && type == r.type) return;
            c[i] = {type} as IMonitorProp;
            p.onChange(c);
        };

        const change = (o:{[key:string]:any}) => {
            c[i] = Object.assign({}, r || {}, o) as IMonitorProp;
            p.onChange(c.filter(c=>c.type != MonitorPropType.none));
        };
       /* let def;
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
*/
        let unit: MonitorUnit = MonitorUnit.count;
        let hasUnit = false;
        if (r.type != MonitorPropType.none && r.type != MonitorPropType.string && r.type != MonitorPropType.uptime) {
            hasUnit = true;
            unit = r.unit || MonitorUnit.bytes;
        }

        rows.push(
            <tr key={i}>
                <td>
                    <SelectField value={r.type} onChange={(a, b, value) => changeType(value)}>
                        <MenuItem value={MonitorPropType.aOfB} primaryText="A of b" />
                        <MenuItem value={MonitorPropType.distribution} primaryText="Distribution" />
                        <MenuItem value={MonitorPropType.number} primaryText="Number" />
                        <MenuItem value={MonitorPropType.sum} primaryText="Sum" />
                        <MenuItem value={MonitorPropType.string} primaryText="String" />
                        <MenuItem value={MonitorPropType.sumAndCount} primaryText="Sum and count" />
                        <MenuItem value={MonitorPropType.uptime} primaryText="Uptime" />
                        <MenuItem value={MonitorPropType.none} primaryText="Nothing" />
                    </SelectField>
                </td>
                <td><TextField value={r.type != MonitorPropType.none && r.identifier || ""} disabled={r.type == MonitorPropType.none} onChange={(a, value) => change({identifier: value})}/></td>
                <td>
                    <SelectField value={unit} disabled={!hasUnit} onChange={(a, b, value) => change({unit: value})}>
                        <MenuItem value={MonitorUnit.count} disabled={r.type == MonitorPropType.sumAndCount} primaryText="Count" />
                        <MenuItem value={MonitorUnit.bytes} primaryText="Bytes" />
                        <MenuItem value={MonitorUnit.fraction} primaryText="Fraction" />
                        <MenuItem value={MonitorUnit.seconds} primaryText="Seconds" />
                        <MenuItem value={MonitorUnit.area}  primaryText="Area" />
                    </SelectField>
                </td>
                <td>
                    <Toggle key="collection" toggled={(r.type != MonitorPropType.none && r.collection)||false} onToggle={(a,value)=>change({collection: value})} disabled={r.type == MonitorPropType.none} />
                </td>
            </tr>);
    }

    return (
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Identifier</th>
                    <th>Unit</th>
                    <th>Collection</th>
    
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>);
}

export default MonitorContent;