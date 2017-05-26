import * as React from "react";
import {Card, CardActions, CardHeader, CardMedia, CardTitle, CardText} from 'material-ui/Card';
import TextField from 'material-ui/TextField';
import {TRIGGER_TYPE} from '../../shared/state'
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';

interface IProps {
    triggers: {type:TRIGGER_TYPE, value:string}[];
    setTriggers(triggers: {type:TRIGGER_TYPE, value:string}[]):void;
}
/*
export function Triggers(props:IProps) {
	let triggers = props.triggers.slice(0);
	let rows=[];
	let setTriggers = () => {
		props.setTriggers(triggers.filter(t => t.type != TRIGGER_TYPE.None));
	}
	
    for (let i=0; i <= triggers.length; ++i) {
		let v = i < triggers.length && triggers[i];
		rows.push(
			<tr key={i}>
				<td>
                    <SelectField floatingLabelText="Type"
                        value={v.type || TRIGGER_TYPE.None}
                        onChange={(e:any, idx:number, value:TRIGGER_TYPE) => {
                            if (v)
                                triggers[i].type = value; 
                            else
                                triggers.push({type:value, value:""});
                            setTriggers();
                        }}>
                        <MenuItem value={TRIGGER_TYPE.None} primaryText="None" />
                        <MenuItem value={TRIGGER_TYPE.RestartService} primaryText="Restart Service" />
                        <MenuItem value={TRIGGER_TYPE.ReloadService} primaryText="Reload Service" />
                    </SelectField>
				</td><td>
					<TextField value={v.value || ""} disabled={!v} onChange={(e:any, value:string) => {triggers[i].value = value; setTriggers();}} />
				</td>
		   </tr>);
    }

    return (
        <Card>
            <CardTitle title="Triggers"/>
            <CardText>
			<table>
			<thead>
			<tr><th>Type</th><th>Value</th><th></th></tr>
			</thead>
			<tbody>
			{rows}
			</tbody>
			</table>
            </CardText>
        </Card>
    )
}*/

export function Triggers(props:IProps) {
	let triggers = props.triggers.slice(0);
	let rows=[];
	let setTriggers = () => {
		props.setTriggers(triggers.filter(t => t.type != TRIGGER_TYPE.None));
	}
	
    for (let i=0; i <= triggers.length; ++i) {
		let v = i < triggers.length && triggers[i];
		rows.push(
			<tr key={i}>
				<td>
                    <SelectField
                        value={v.type || TRIGGER_TYPE.None}
                        onChange={(e:any, idx:number, value:TRIGGER_TYPE) => {
                            if (v)
                                triggers[i].type = value; 
                            else
                                triggers.push({type:value, value:""});
                            setTriggers();
                        }}>
                        <MenuItem value={TRIGGER_TYPE.None} primaryText="None" />
                        <MenuItem value={TRIGGER_TYPE.RestartService} primaryText="Restart Service" />
                        <MenuItem value={TRIGGER_TYPE.ReloadService} primaryText="Reload Service" />
                    </SelectField>
				</td><td>
					<TextField value={v.value || ""} disabled={!v} onChange={(e:any, value:string) => {triggers[i].value = value; setTriggers();}} />
				</td>
		   </tr>);
    }

    return (
        <table>
            <thead>
            <tr><th>Type</th><th>Value</th><th></th></tr>
            </thead>
            <tbody>
            {rows}
            </tbody>
        </table>
    )
}