import * as React from "react";
import {Card, CardActions, CardHeader, CardMedia, CardTitle, CardText} from 'material-ui/Card';
import TextField from 'material-ui/TextField';

interface IProps {
    variables: {key:string, value:string}[];
    setVariables(vars: {key:string, value:string}[]):void;
}

export function Variables(props:IProps) {
	let vars=props.variables.slice(0);
	let rows=[];
	let setVars = () => {
		props.setVariables(vars.filter((v)=>v.key != "" || v.value != ""));
	}
	
    for (let i=0; i < vars.length; ++i) {
		let v = vars[i];
		rows.push(
			<tr key={i}>
				<td>
					<TextField value={v.key} onChange={(e:any, value:string) => {vars[i].key = value; setVars();}} />
				</td><td>
					<TextField value={v.value} onChange={(e:any, value:string) => {vars[i].value = value; setVars();}} />
				</td>
		   </tr>);
    }


	rows.push(
		<tr key={vars.length}>
			<td>
				<TextField value="" onChange={(e:any, value:string) => {vars.push({key:value, value:""}); setVars();}} />
			</td><td>
				<TextField value="" onChange={(e:any, value:string) => {vars.push({key:"", value:value}); setVars();}} />
			</td>
		</tr>);
				
    return (
        <Card>
            <CardTitle title="Variables"/>
            <CardText>
			<table>
			<thead>
			<tr><th>Key</th><th>Value</th><th></th></tr>
			</thead>
			<tbody>
			{rows}
			</tbody>
			</table>
            </CardText>
        </Card>
    )
}

