import TextField from 'material-ui/TextField';
import * as React from "react";

interface IProps {
    value: string;
    onChange: (value:string) => void;
}

export function Password(props:IProps) {
    // Note we put a dummy username and password field in front in order to make chrome not autocomplet the password
    return <span>
        <input type="text" name="name" style={{width:1, border: 0, visibility: "hidden"}} />
        <input type="password" name="password" style={{width:1, border: 0, visibility: "hidden"}} />
        <TextField className="no_fill_password" type="password" value={props.value} onChange={(e:any, value:string) => props.onChange(value)}/>
        </span>;
}

        
