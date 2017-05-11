import * as React from "react";
import { InformationList, InformationListRow } from './information_list'
import TextField from 'material-ui/TextField';
import { IMainState } from './reducers';
import { Dispatch } from 'redux'
import { connect } from 'react-redux'
import { IObject } from '../../shared/state'
import { ACTION, ISetObjectName } from '../../shared/actions'

interface IProps {
    id: number;
}

interface StateProps {
    current: IObject;
    id: number;
}

interface DispactProps {
    setName: (name: string) => void;
}

function mapStateToProps(s: IMainState, p: IProps): StateProps {
    return { current: s.objects[p.id].current, id: p.id };
}

function mapDispatchToProps(dispatch: Dispatch<IMainState>, p: IProps): DispactProps {
    return {
        setName: (name: string) => {
            const a: ISetObjectName = {
                type: ACTION.SetObjectName,
                id: p.id,
                name
            };
            dispatch(a);
        },
    }
}

export function PackageImpl(props: StateProps & DispactProps) {
    return (
        <div>
            <InformationList key={props.id + props.current.version}>
                <InformationListRow name="Name">
                    <TextField value={props.current.name} onChange={(e: any, value: string) => props.setName(value)} />
                </InformationListRow>
            </InformationList>
        </div>)
}

export const Package = connect(mapStateToProps, mapDispatchToProps)(PackageImpl);
