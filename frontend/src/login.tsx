import * as React from "react";
import Dialog from 'material-ui/Dialog';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import {connect} from 'react-redux'
import { createSelector } from 'reselect';
import {IMainState, ILogin} from './reducers';
import {Dispatch} from 'redux'
import * as State from '../../shared/state'
import {CONNECTION_STATUS, IAuthStatus, ACTION} from '../../shared/actions';
import CircularProgress from 'material-ui/CircularProgress';

interface IProps {
    connection: CONNECTION_STATUS;
    auth: IAuthStatus;
    login: ILogin;
    setUsername: (value:string) => void;
    setPwd: (value:string) => void;
    setOtp: (value:string) => void;
    doLogin: (user: string, pwd:string, otp:string) => void;
}

const getConnectionStatus = (state:IMainState) => state.connectionStatus;
const getAuthStatus = (state:IMainState) => state.authStatus;
const getLogin = (state:IMainState) => state.login;


const mapStateToProps = createSelector([getConnectionStatus, getAuthStatus, getLogin], (connection, auth, login) => {
    return {connection, auth, login};
});

function mapDispatchToProps(dispatch:Dispatch<IMainState>) {
    return {
        setUsername: (value:string) => {dispatch({type: ACTION.SetLoginUsername, value})},
        setPwd: (value:string) => {dispatch({type: ACTION.SetLoginPassword, value})},
        setOtp: (value:string) => {dispatch({type: ACTION.SetLoginOtp, value})},
        doLogin: (user: string, pwd:string, otp:string) => {dispatch({type: ACTION.Login, user, pwd, otp});}
    }
};

function LoginImpl(props:IProps) {
    let message="";
    switch (props.connection) {
    case CONNECTION_STATUS.AUTHENTICATING: message = "Authenticating"; break;
    case CONNECTION_STATUS.CONNECTED: message = "Connected"; break;
    case CONNECTION_STATUS.CONNECTING: message = "Connecting"; break;
    case CONNECTION_STATUS.INITING: message = "Loading initial state"; break;
    case CONNECTION_STATUS.LOGIN: message = props.auth.message; break;
    case CONNECTION_STATUS.WAITING: message = "Waiting"; break;
    }
    let progress = null;
    if (props.connection != CONNECTION_STATUS.LOGIN) progress = <CircularProgress />;

    const dis = props.connection != CONNECTION_STATUS.LOGIN;
    const o = (props.auth && props.auth.user == props.login.user && props.auth.otp);
    const dlog = dis || !props.login.user || !props.login.pwd || (!props.login.otp && !o);

    return (<Dialog title="Login" modal={true} open={true}>
        {progress} {message} <br />
        <form onSubmit={(e)=>{if (!dlog) props.doLogin(props.login.user, props.login.pwd, props.login.otp); e.preventDefault()}}>
            <TextField name="user" hintText="User" floatingLabelText="User" disabled={dis} value={props.login.user} onChange={(_,value)=>props.setUsername(value)} errorText={(dis || props.login.user)?null:"Required"}/><br />
            <TextField name="pwd" hintText="Password" floatingLabelText="Password" type="password" disabled={dis} value={props.login.pwd} onChange={(_,value)=>props.setPwd(value)} errorText={(dis || props.login.pwd)?null:"Required"}/><br />
            <TextField name="otp" hintText="One Time Password" floatingLabelText="One Time Password" disabled={dis || o} value={props.login.otp} onChange={(_,value)=>props.setOtp(value)} errorText={(dis || props.login.otp || o)?null:"Required"} /> <br/>
            <RaisedButton label="Login" primary={true} type="submit" disabled={dlog}/>
        </form>
    </Dialog>);
}

export let Login = connect(mapStateToProps, mapDispatchToProps)(LoginImpl);
