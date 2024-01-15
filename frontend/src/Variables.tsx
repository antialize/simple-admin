import { TextField, Typography } from "@mui/material";

interface IProps {
    variables: {key:string, value:string}[];
    setVariables(vars: {key:string, value:string}[]):void;
}

function Variables(props:IProps) {
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
                    <TextField value={v.key} onChange={(e) => {vars[i].key = e.target.value; setVars();}} variant="standard" />
                </td><td>
                    <TextField value={v.value} onChange={(e) => {vars[i].value = e.target.value; setVars();}} variant="standard" />
                </td>
            </tr>);
    }

    rows.push(
        <tr key={vars.length}>
            <td>
                <TextField value="" onChange={(e) => {vars.push({key:e.target.value, value:""}); setVars();}} variant="standard"/>
            </td><td>
                <TextField value="" onChange={(e) => {vars.push({key:"", value:e.target.value}); setVars();}} variant="standard"/>
            </td>
        </tr>);

    return (
            <table>
                <thead>
                    <tr><th><Typography>Key</Typography></th><th><Typography>Value</Typography></th><th></th></tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
    )
}

export default Variables;
