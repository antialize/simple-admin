import { TextField } from "@mui/material";

interface IProps {
    value: string;
    onChange: (value: string) => void;
}

function Password(props: IProps) {
    return (
        <TextField
            variant="standard"
            type="text"
            value={props.value}
            autoComplete="off"
            sx={{ "& input": { WebkitTextSecurity: "disc" } }}
            onChange={(e) => {
                props.onChange(e.target.value);
            }}
        />
    );
}

export default Password;
