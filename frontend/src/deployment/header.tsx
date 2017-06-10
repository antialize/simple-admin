import * as React from "react";
import {IMainState} from '../reducers';
import * as State from '../../../shared/state'
import {connect} from 'react-redux'

import * as page from '../page'
import CircularProgress from 'material-ui/CircularProgress';
import Buttons from '../deployment/buttons';

interface IProps {}

interface StateProps {
    status: State.DEPLOYMENT_STATUS;
}

function mapStateToProps(s:IMainState, {}): StateProps {
    return {status: s.deployment.status}
}

function HeaderImpl(props:StateProps) {
    let spin = false;
    let status = "";

    switch (props.status) {
    case State.DEPLOYMENT_STATUS.BuildingTree:
        status = " - Building tree";
        spin = true;
        break;
    case State.DEPLOYMENT_STATUS.ComputingChanges:
        status = " - Computing changes";
        spin = true;
        break;
    case State.DEPLOYMENT_STATUS.Deploying:
        status = " - Deploying";
        spin = true;
        break;
    case State.DEPLOYMENT_STATUS.Done:
        status = " - Done"
        spin = false;
        break;
    case State.DEPLOYMENT_STATUS.InvilidTree:
        status = " - Invalid tree"
        spin = false;
        break;
    case State.DEPLOYMENT_STATUS.ReviewChanges:
        status = " - Review changes";
        spin = false;
    }

    return (
        <h1 className="deployment_header">
            {spin?<CircularProgress />:null} Deployment{status}
        </h1>
        );
}

export const Header = connect(mapStateToProps)(HeaderImpl);
export default Header;