import * as React from "react";
import MenuItem from "@material-ui/core/MenuItem";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import state from "./state";
import { Theme, StyleRules, createStyles, withStyles, StyledComponentProps } from "@material-ui/core/styles";
import { TypePropType, ITrigger } from '../../shared/type'
import { observer } from "mobx-react";
import derivedState from "./derivedState";
import nullCheck from '../../shared/nullCheck';

interface TriggersProps {
    triggers:ITrigger[];
    setTriggers: (triggers: ITrigger[])=>void;
}

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

const TriggersImpl = observer(function Triggers(p:TriggersProps & StyledComponentProps) {
	let triggers = p.triggers.slice(0);
	let rows: JSX.Element[] =[];
	let setTriggers = () => {
		p.setTriggers(triggers.filter(t => t.id != 0));
	}
	
    for (let i=0; i <= triggers.length; ++i) {
		const v = i < triggers.length && triggers[i];

        const t = v ? derivedState.triggers.find(t => t.id == v.id) : null;
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
                        value={(v && v.id) || 0}
                        onChange={(e) => {
                            if (v)
                                triggers[i] = {id:+e.target.value, values: []};
                            else
                                triggers.push({id:+e.target.value, values:[]});
                            setTriggers();
                        }}>
                        <MenuItem value={0}>None</MenuItem>
                        {derivedState.triggers.map(t => <MenuItem key={t.name} value={t.id}>{t.name}</MenuItem>)}
                    </Select>
				</td><td>
                    {fields}
				</td>
		   </tr>);
    }

    const classes = nullCheck(p.classes);
    return (
        <table>
            <thead>
            <tr><th className={classes.th}>Type</th><th className={classes.th}>Content</th><th className={classes.th}></th></tr>
            </thead>
            <tbody>
            {rows}
            </tbody>
        </table>
    )
});

function TriggersI(p:TriggersProps & StyledComponentProps) {
    return <TriggersImpl setTriggers={p.setTriggers} triggers={p.triggers} classes={p.classes}/>;
}

const Triggers = withStyles(styles)(TriggersI);

export default Triggers;

