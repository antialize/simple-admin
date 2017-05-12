import {DEPLOYMENT_STATUS, DEPLOYMENT_OBJECT_STATUS, IDeploymentObject} from '../../shared/state'
import {webClients} from './instances'
import {ACTION, ISetDeploymentStatus, ISetDeploymentMessage, IToggleDeploymentObject} from '../../shared/actions'

export class Deployment {
    status: DEPLOYMENT_STATUS = DEPLOYMENT_STATUS.Done;
    message: string;

    setStatus(s: DEPLOYMENT_STATUS) {
        this.status = s;
        let a: ISetDeploymentStatus = {
            type: ACTION.SetDeploymentStatus,
            status: s
        };
        webClients.broadcast(a);
    }

    setMessage(msg:string) {
        this.message = msg;
        let a: ISetDeploymentMessage = {
            type: ACTION.SetDeploymentMessage,
            message: msg
        };
        webClients.broadcast(a);
    }

    deployObject(id:number) {
        this.setStatus(DEPLOYMENT_STATUS.BuildingTree);
    }

    start() {}

    stop() {}

    cancel() {
        this.setStatus(DEPLOYMENT_STATUS.Done);
    }

    toggleObject(id: number, enabled: boolean) {
        let a: IToggleDeploymentObject = {
            type: ACTION.ToggleDeploymentObject,
            id,
            enabled,
            source: "server"
        }
        webClients.broadcast(a);
    }
};
