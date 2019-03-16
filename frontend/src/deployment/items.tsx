import * as React from "react";
import * as State from '../../../shared/state'
import Item from './item'
import state from "../state";
import { observer } from "mobx-react";

export default observer(()=>{
    switch (state.deployment.status) {
    case State.DEPLOYMENT_STATUS.BuildingTree:
    case State.DEPLOYMENT_STATUS.InvilidTree:
    case State.DEPLOYMENT_STATUS.ComputingChanges:
        return null;
    case State.DEPLOYMENT_STATUS.Deploying:
    case State.DEPLOYMENT_STATUS.Done:
    case State.DEPLOYMENT_STATUS.ReviewChanges:
        break;
    }
    const c = state.deployment.objects.length;
    let rows: JSX.Element[] = [];
    
    for (let i=0; i < c; ++i)
        rows.push(<Item index={i} />);

    return (
        <div className="deployment_items">
            <table className="deployment">
                <thead>
                    <tr>
                        <th>Host</th><th>Object</th><th>Type</th><th>Action</th><th>Enable</th><th>Details</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>);
});
