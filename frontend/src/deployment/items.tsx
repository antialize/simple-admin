import * as React from "react";
import {IMainState} from '../reducers';
import * as State from '../../../shared/state'
import {connect} from 'react-redux'
import Item from './item'

interface StateProps {
    count: number;
}
function mapStateToProps(s:IMainState): StateProps {
    let items = false;
    switch (s.deployment.status) {
    case State.DEPLOYMENT_STATUS.BuildingTree:
    case State.DEPLOYMENT_STATUS.InvilidTree:
    case State.DEPLOYMENT_STATUS.ComputingChanges:
        break;
    case State.DEPLOYMENT_STATUS.Deploying:
    case State.DEPLOYMENT_STATUS.Done:
    case State.DEPLOYMENT_STATUS.ReviewChanges:
        items = true;
        break;
    }
    return {count: items?s.deployment.objects.length:0}
}

function ItemsImpl(props:StateProps) {
    if (props.count == 0) return null;
    let rows: JSX.Element[] = [];
    
    for (let i=0; i < props.count; ++i)
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
}

export const Items = connect(mapStateToProps)(ItemsImpl);
export default Items;