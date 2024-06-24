import Cookies from "js-cookie";
import { action, makeObservable, observable } from "mobx";
import { ACTION, type ILogin, type ILogout } from "./shared/actions";
import state, { CONNECTION_STATUS } from "./state";

class LoginState {
    constructor() {
        makeObservable(this);
    }

    @observable
    user = "";

    @observable
    pwd = "";

    @observable
    otp = "";

    @action
    login() {
        const l: ILogin = {
            type: ACTION.Login,
            user: this.user,
            pwd: this.pwd,
            otp: this.otp,
        };
        state.sendMessage(l);
        state.connectionStatus = CONNECTION_STATUS.AUTHENTICATING;
        this.user = "";
        this.pwd = "";
        this.otp = "";
    }

    @action
    logout(forgetOtp: boolean) {
        const l: ILogout = {
            type: ACTION.Logout,
            forgetPwd: true,
            forgetOtp,
        };
        state.sendMessage(l);
        state.loaded = false;
        if (forgetOtp) {
            this.user = "";
            this.pwd = "";
            this.otp = "";
            Cookies.remove("simple-admin-session");
        }
    }
}

export default LoginState;
