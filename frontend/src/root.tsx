import * as React from "react";
import { InformationList, InformationListRow } from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import { IMainState } from './reducers';
import { Dispatch } from 'redux'
import { connect } from 'react-redux'
import { IObject, IRootContent } from '../../shared/state'
import { ACTION, ISetObjectName, ISetObjectContentParam } from '../../shared/actions'
import { Variables } from './variables'

interface IProps {
    id: number;
}

interface StateProps {
    current: IObject;
    id: number;
}

interface DispactProps {
    setName: (name: string) => void;
    setProp: (prop: string, value: any) => void;
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
        setProp: (prop: string, value: any) => {
            const a: ISetObjectContentParam = {
                type: ACTION.SetObjectContentParam,
                id: p.id,
                param: prop,
                value
            };
            dispatch(a);
        },
    }
}

export function RootImpl(props: StateProps & DispactProps) {
    const c = props.current.content as IRootContent;
    return (
        <div>
            <Variables variables={c.variables ? c.variables : []} setVariables={(vars: { key: string, value: string }[]) => props.setProp("variables", vars)} />
        </div>)
}

export const Root = connect(mapStateToProps, mapDispatchToProps)(RootImpl);
