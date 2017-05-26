import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import {ObjectSelector} from './object_selector'
import {IMainState} from './reducers';
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import {IObject, ICollectionContent} from '../../shared/state'
import {ACTION, ISetObjectName, ISetObjectContentParam} from '../../shared/actions'
import {Variables} from './variables'

interface IProps {
    id: number;
}

interface StateProps {
    current: IObject;
    id: number;
}

interface DispactProps {
    setName: (name: string) => void;
    setProp: (prop:string, value:any) => void;
}

function mapStateToProps(s:IMainState, p: IProps): StateProps {
    return {current: s.objects[p.id].current, id: p.id};
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, p: IProps): DispactProps {
     return {
        setName: (name: string) => {
            const a:ISetObjectName = {
                type: ACTION.SetObjectName,
                id: p.id,
                name
            };
            dispatch(a);
        },
        setProp: (prop:string, value:any) => {
            const a:ISetObjectContentParam = {
                type: ACTION.SetObjectContentParam,
                id: p.id,
                param: prop,
                value
            };
            dispatch(a);
        },
    }
}

export function CollectionImpl(props: StateProps & DispactProps) {
    const c = props.current.content as ICollectionContent;
    return (
        <div>
            <InformationList key={props.id + props.current.version}>
                <InformationListRow name="Name">
                    <TextField value={props.current.name} onChange={(e:any, value:string) => props.setName(value)} />
                </InformationListRow>
                <InformationListRow name="Variables" long={true}>
                    <Variables variables={c.variables?c.variables:[]} setVariables={(vars: {key:string, value:string}[])=> props.setProp("variables", vars)} />
                </InformationListRow>
                <InformationListRow name="Has" long={true}>
                    <ObjectSelector filter={(cls:string, id:number)=>id != props.id} selected={c.contains?c.contains:[]} setSelected={(sel:number[]) => {props.setProp("contains",sel)}}/>
                </InformationListRow>
            </InformationList>
        </div>)
}

export const Collection = connect(mapStateToProps, mapDispatchToProps)(CollectionImpl);