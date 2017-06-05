import * as React from "react";
import {Card, CardActions, CardHeader, CardMedia, CardTitle, CardText} from 'material-ui/Card';
import TextField from 'material-ui/TextField';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';

import {IObject2} from '../../shared/state'
import {IType, TypePropType, ITrigger, ITriggers} from '../../shared/type'
import {connect} from 'react-redux'
import {IMainState} from './reducers';


interface IProps {
    triggers: ITrigger[];
    setTriggers(triggers: ITrigger[]):void;
}

interface StateProps {
    triggers:IObject2<IType>[];
    p: IProps;
}

function mapStateToProps(s:IMainState, p: IProps): StateProps {
    let triggers:IObject2<IType>[] = [];
    for(const key in s.types) {
        const type = s.types[key];
        if (type.content.kind != "trigger") continue;
        triggers.push(type);
    }
    triggers.sort( (l,r) => {
        return l.name < r.name ? -1: 1;
    });
    return {triggers, p}
}

export function TriggersImpl(props:StateProps) {
	let triggers = props.p.triggers.slice(0);
	let rows: JSX.Element[] =[];
	let setTriggers = () => {
		props.p.setTriggers(triggers.filter(t => t.id != 0));
	}
	
    for (let i=0; i <= triggers.length; ++i) {
		const v = i < triggers.length && triggers[i];

        const t = v ? props.triggers.find(t => t.id == v.id) : null;
        let fields: JSX.Element[] = [];
        if (v && t && t.content && t.content.content) {
            for (let item of t.content.content) {
                switch (item.type) {
                case TypePropType.text: {
                    let itt = item;
                    fields.push(<TextField key={item.name} value={(v && v.values && v.values[item.name]) || item.default} disabled={!v} onChange={(e:any, value:string) => {triggers[i].values = Object.assign({}, triggers[i].values); triggers[i].values[itt.name] = value; setTriggers();}} hintText={item.title}/>);
                }
                }
            }
        }
		rows.push(
			<tr key={i}>
				<td>
                    <SelectField
                        value={v.id || 0}
                        onChange={(e:any, idx:number, value:number) => {
                            if (v)
                                triggers[i] = {id:value, values: []}; 
                            else
                                triggers.push({id:value, values:[]});
                            setTriggers();
                        }}>
                        <MenuItem value={0} primaryText="None" />
                        {props.triggers.map(t => <MenuItem key={t.name} value={t.id} primaryText={t.name} />)}
                    </SelectField>
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
}

export const Triggers = connect(mapStateToProps)(TriggersImpl);
