import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from "@mui/material";
import state, { CONNECTION_STATUS } from "./state";
import { observer } from "mobx-react";
import Error from "./Error";

const Login = observer(function Login() {
    const l = state.login;
    if (!l) return <Error>Missing state.login</Error>;
    let message="";
    switch (state.connectionStatus) {
    case CONNECTION_STATUS.AUTHENTICATING: message = "Authenticating"; break;
    case CONNECTION_STATUS.CONNECTED: message = "Connected"; break;
    case CONNECTION_STATUS.CONNECTING: message = "Connecting"; break;
    case CONNECTION_STATUS.INITING: message = "Loading initial state"; break;
    case CONNECTION_STATUS.LOGIN: message = state.authMessage || "Error"; break;
    case CONNECTION_STATUS.WAITING: message = "Waiting"; break;
    }
    let progress = null;
    if (state.connectionStatus != CONNECTION_STATUS.LOGIN) progress = <CircularProgress />;

    const dis = state.connectionStatus != CONNECTION_STATUS.LOGIN;
    const o = (state.authUser == l.user && state.authOtp);
    const dlog = dis || !l.user || !l.pwd || (!l.otp && !o);

    return (<Dialog open fullWidth >
        <DialogTitle>Login</DialogTitle>
        <form onSubmit={(e)=>{if (!dlog) l.login(); e.preventDefault()}}>
            <DialogContent>
                {progress}
                <DialogContentText>{message}</DialogContentText>
                <TextField variant="standard" fullWidth name="user" helperText="User" disabled={dis} value={l.user} onChange={(e)=>l.user=e.target.value} error={!(dis || l.user)}/><br />
                <TextField variant="standard" fullWidth name="pwd" helperText="Password" type="password" disabled={dis} value={l.pwd} onChange={(e)=>l.pwd = e.target.value} error={!(dis || l.pwd)}/><br />
                <TextField variant="standard" fullWidth name="otp" helperText="One Time Password" disabled={dis || o} value={l.otp} onChange={(e)=>l.otp = e.target.value} error={!(dis || l.otp || o)} />
            </DialogContent>
            <DialogActions>
                <Button variant="contained" color="primary" type="submit" disabled={dlog}>Login</Button>
            </DialogActions>
        </form>
    </Dialog>);
});

export default Login;
