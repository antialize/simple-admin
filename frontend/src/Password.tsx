import { TextField } from "@mui/material";

interface IProps {
    value: string;
    onChange: (value: string) => void;
}

function Password(props: IProps) {
    return (
        <TextField
            variant="standard"
            type="password"
            value={props.value}
            autoComplete="new-password"
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
        />
    );
}

export default Password;
