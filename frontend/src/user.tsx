import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import {ObjectSelector} from './object_selector'
import {IMainState} from './reducers';
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import {IObject, IUserContent} from '../../shared/state'
import {ACTION, ISetObjectName, ISetObjectContentParam} from '../../shared/actions'


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


export function UserImpl(props: StateProps & DispactProps) {
    const c = props.current.content as IUserContent;
    /*
                <ObjectSelector name="Groups"/>
            <ObjectSelector name="Files"/>
            <ObjectSelector name="In"/>*/
    return (
        <div>
            <InformationList key={props.id + props.current.version}>
                <InformationListRow name="Name">
                    <TextField value={props.current.name} onChange={(e:any, value:string) => props.setName(value)} />
                </InformationListRow>
                <InformationListRow name="First Name">
                    <TextField value={c.firstName} onChange={(e:any, value:string) => props.setProp("firstName",value)} />
                </InformationListRow>
                <InformationListRow name="Last Name">
                    <TextField value={c.lastName} onChange={(e:any, value:string) => props.setProp("lastName",value)} />
                </InformationListRow>
                <InformationListRow name="Email">
                    <TextField value={c.email} onChange={(e:any, value:string) => props.setProp("email",value)} />
                </InformationListRow>
                <InformationListRow name="System">
                    <Toggle toggled={c.system} onToggle={(e:any, value:boolean) => props.setProp("system",value)} />
                </InformationListRow>
                <InformationListRow name="Sudo">
                    <Toggle toggled={c.sudo} onToggle={(e:any, value:boolean) => props.setProp("sudo",value)} />
                </InformationListRow>
                <InformationListRow name="Password">
                    <TextField type="password" value={c.password} onChange={(e:any, value:string) => props.setProp("password",value)} />
                </InformationListRow>
                <InformationListRow name="Groups">
                    <TextField value={c.groups} onChange={(e:any, value:string) => props.setProp("groups",value)} />
                </InformationListRow>
            </InformationList>
            <ObjectSelector filter={(cls, id)=>(cls == 'file' || cls == 'collection')} selected={c.contains?c.contains:[]} setSelected={(sel:number[]) => {props.setProp("contains",sel)}} name="Has"/>
            <ObjectSelector filter={(cls, id)=>(cls != 'host' && cls != 'group' && cls != 'user')} selected={c.depends?c.depends:[]} setSelected={(sel:number[]) => {props.setProp("depends",sel)}} name="Depends on"/>
        </div>)
}

export const User = connect(mapStateToProps, mapDispatchToProps)(UserImpl);