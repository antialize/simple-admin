import * as React from "react";
import {TypePropType, ITrigger} from '../../shared/type'
import { observer } from "mobx-react";
import state from "./state";
import TextField from "@material-ui/core/TextField";
import Select from "@material-ui/core/Select";
import MenuItem from "@material-ui/core/MenuItem";

export default observer((p:{triggers:ITrigger[], setTriggers: (triggers: ITrigger[])=>void}) => {
	let triggers = p.triggers.slice(0);
	let rows: JSX.Element[] =[];
	let setTriggers = () => {
		p.setTriggers(triggers.filter(t => t.id != 0));
	}
	
    for (let i=0; i <= triggers.length; ++i) {
		const v = i < triggers.length && triggers[i];

        const t = v ? state.triggers.find(t => t.id == v.id) : null;
        let fields: JSX.Element[] = [];
        if (v && t && t.content && t.content.content) {
            for (let item of t.content.content) {
                switch (item.type) {
                case TypePropType.text: {
                    let itt = item; //hintText={item.title}
                    fields.push(<TextField key={item.name} value={(v && v.values && v.values[item.name]) || item.default} disabled={!v} onChange={(e) => {triggers[i].values = Object.assign({}, triggers[i].values); triggers[i].values[itt.name] = e.target.value; setTriggers();}}/>);
                }
                }
            }
        }
		rows.push(
			<tr key={i}>
				<td>
                    <Select
                        value={v.id || 0}
                        onChange={(e) => {
                            if (v)
                                triggers[i] = {id:+e.target.value, values: []};
                            else
                                triggers.push({id:+e.target.value, values:[]});
                            setTriggers();
                        }}>
                        <MenuItem value={0}>None</MenuItem>
                        {state.triggers.map(t => <MenuItem key={t.name} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
				</td><td>
                    {fields}
				</td>
		   </tr>);
    }

    return (
        <table>
            <thead>
            <tr><th>Type</th><th>Content</th><th></th></tr>
            </thead>
            <tbody>
            {rows}
            </tbody>
        </table>
    )
});

