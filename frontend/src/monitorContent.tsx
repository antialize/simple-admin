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

        let unit: MonitorUnit = MonitorUnit.count;
        let hasUnit = false;
        if (r.type != MonitorPropType.none && r.type != MonitorPropType.string && r.type != MonitorPropType.up) {
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
                        <MenuItem value={MonitorPropType.up} primaryText="Up" />
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
            </tr>);
    }

    return (
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Identifier</th>
                    <th>Unit</th>
                   </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>);
}

export default MonitorContent;