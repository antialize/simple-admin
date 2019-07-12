import * as React from "react";
import MenuItem from "@material-ui/core/MenuItem";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import {IMonitorProp, MonitorPropType, MonitorUnit} from '../../shared/monitor';

function MonitorContent(p: {content: IMonitorProp[], onChange: (v: IMonitorProp[])=>void}) {
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
                    <Select value={r.type} onChange={(e) => changeType(+(e.target.value as any))}>
                        <MenuItem value={MonitorPropType.aOfB}>A of b</MenuItem>
                        <MenuItem value={MonitorPropType.distribution}>Distribution</MenuItem>
                        <MenuItem value={MonitorPropType.number}>Number</MenuItem>
                        <MenuItem value={MonitorPropType.sum}>Sum</MenuItem>
                        <MenuItem value={MonitorPropType.string}>String</MenuItem>
                        <MenuItem value={MonitorPropType.sumAndCount}>Sum and count</MenuItem>
                        <MenuItem value={MonitorPropType.up}>Up</MenuItem>
                        <MenuItem value={MonitorPropType.none}>Nothing</MenuItem>
                    </Select>
                </td>
                <td><TextField value={r.type != MonitorPropType.none && r.identifier || ""} disabled={r.type == MonitorPropType.none} onChange={(e) => change({identifier: e.target.value})}/></td>
                <td>
                    <Select value={unit} disabled={!hasUnit} onChange={(e) => change({unit: +(e.target.value as any)})}>
                        <MenuItem value={MonitorUnit.count} disabled={r.type == MonitorPropType.sumAndCount}>Count</MenuItem>
                        <MenuItem value={MonitorUnit.bytes}>Bytes</MenuItem>
                        <MenuItem value={MonitorUnit.fraction}>Fraction</MenuItem>
                        <MenuItem value={MonitorUnit.seconds}>Seconds</MenuItem>
                        <MenuItem value={MonitorUnit.area}>Area</MenuItem>
                    </Select>
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
