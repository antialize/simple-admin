import { TextField } from "@mui/material";

interface IProps {
    value: string;
    onChange: (value:string) => void;
}

function Password(props:IProps) {
    // Note we put a dummy username and password field in front in order to make chrome not autocomplete the password
    return <span>
        <form method="post">
            <input type="text" name="name" value="cookie" readOnly={true} style={{width:1, border: 0, visibility: "hidden"}} />
            <input type="password" name="password1" readOnly={true} style={{width:1, border: 0, visibility: "hidden"}} />
            <input type="password" name="password2" readOnly={true} style={{width:1, border: 0, visibility: "hidden"}} />
            <input type="password" name="password3" readOnly={true} style={{width:1, border: 0, visibility: "hidden"}} />
            <TextField variant="standard" className="no_fill_password" type="password" value={props.value} onChange={(e) => props.onChange(e.target.value)}/>
        </form>
        </span>;
}

export default Password;
