import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Editor from './editor'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import {IMainState} from './reducers';
import {IObject, IFileContent} from '../../shared/state'
import {ACTION, ISetObjectName, ISetObjectContentParam} from '../../shared/actions'
import {Triggers} from './triggers';

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

export function FileImpl(props: StateProps & DispactProps) {
    const c = props.current.content as IFileContent;
    return (
        <div>
            <InformationList key={props.id + props.current.version}>
                <InformationListRow name="Name">
                    <TextField value={props.current.name} onChange={(e:any, value:string) => props.setName(value)} />
                </InformationListRow>
                <InformationListRow name="Path">
                    <TextField value={c.path} onChange={(e:any, value:string) => props.setProp("path",value)} />
                </InformationListRow>
                <InformationListRow name="User">
                    <TextField value={c.user} onChange={(e:any, value:string) => props.setProp("user",value)} />
                </InformationListRow>
                <InformationListRow name="Group">
                    <TextField value={c.group} onChange={(e:any, value:string) => props.setProp("group",value)} />
                </InformationListRow>
                <InformationListRow name="Mode">
                    <TextField value={c.mode} onChange={(e:any, value:string) => props.setProp("mode",value)} />
                </InformationListRow>
                <InformationListRow name="Triggers" long={true}>
                    <Triggers triggers={c.triggers ? c.triggers : []} setTriggers={triggers => props.setProp("triggers", triggers)} />
                </InformationListRow>
            </InformationList>
	        <Editor data={c.data} setData={(v:string) => props.setProp("data", v)} lang={c.lang} setLang={(v:string) => props.setProp("lang", v)}/>
        </div>)
}

export const File = connect(mapStateToProps, mapDispatchToProps)(FileImpl);

