import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';

import {IObject2} from '../../shared/state'
import {IMainState} from './reducers';
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import {ACTION, ISetObjectName, ISetObjectComment, ISetObjectContentParam, ISetObjectCatagory} from '../../shared/actions'
import {ObjectSelector} from './object_selector'
import {Variables} from './variables'
import {Catagory} from './catagory'
import {Password} from './password'
import {Triggers} from './triggers';
import Editor from './editor'
import TypeContent from './typeContent'
import MonitorContent from './monitorContent'


import {IType, ITypeProp, TypePropType, hostId, typeId, rootId} from '../../shared/type'

interface IProps {
    id: number;
    typeId: number;
}

interface StateProps {
    current: IObject2<any>;
    id: number;
    type: IType;
    typeId: number;
    triggers:IObject2<IType>[];
}

interface DispactProps {
    setCatagory: (name: string) => void;
    setName: (name: string) => void;
    setComment: (comment: string) => void;
    setProp: (prop:string, value:any) => void;
}

function mapStateToProps(s:IMainState, p: IProps): StateProps {
    let triggers:IObject2<IType>[] = [];
    for(const key in s.types) {
        const type = s.types[key];
        if (type.content.kind != "trigger") continue;
        triggers.push(type);
    }

    return {current: s.objects[p.id].current, id: p.id, type: s.types && s.types[p.typeId] && s.types[p.typeId].content, typeId: p.typeId, triggers};
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
        setComment: (comment: string) => {
            const a:ISetObjectComment = {
                type: ACTION.SetObjectComment,
                id: p.id,
                comment
            };
            dispatch(a);
        },
        setCatagory: (catagory: string) => {
            const a:ISetObjectCatagory = {
                type: ACTION.SetObjectCatagory,
                id: p.id,
                catagory
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

function TypeImpl(props: StateProps & DispactProps) {
    if (!props.type)
        return <div>Missing type</div>;
    if (!props.current)
        return <div>Missing content</div>;

    const type = props.type;
    const c = props.current.content as {[key:string]:any};
    let rows = [];
    let extra = [];
    for (const ct of (type && type.content) || []) {
        if (ct.type == TypePropType.none) continue;
        let v = c[ct.name];
        switch (ct.type) {
        case TypePropType.password:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Password value={v==undefined?"":v} onChange={value => props.setProp(ct.name,value)}/></InformationListRow>);
            break;
        case TypePropType.bool:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Toggle title={ct.description} toggled={v==undefined?ct.default:v} onToggle={(e:any, value:boolean) => props.setProp(ct.name,value)}/></InformationListRow>);
            break;
        case TypePropType.text:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><TextField value={v==undefined?ct.default:v} fullWidth={ct.lines && ct.lines > 0} multiLine={ct.lines && ct.lines > 1} rows={ct.lines || 1} onChange={(e: any, value: string) => props.setProp(ct.name,  value)}  hintText={ct.description}/></InformationListRow>);
            break;
        case TypePropType.number:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><TextField value={v==undefined?""+ct.default:""+v} onChange={(e: any, value: string) => props.setProp(ct.name,  +value)}  hintText={ct.description}/></InformationListRow>);
            break;
        case TypePropType.choice:
            rows.push(
                <InformationListRow key={ct.name} name={ct.title}>
                    <SelectField value={v==undefined?ct.default:v} onChange={(a: any, b: any, value:string) => props.setProp(ct.name,  value)} hintText={ct.description}>
                        {ct.choices.map(n =><MenuItem value={n} primaryText={n} />)}
                    </SelectField>
                </InformationListRow>);
            break;
        case TypePropType.document:
            extra.push(<Editor title={ct.title} key={ct.name} data={v==undefined?"":v} setData={(v:string) => props.setProp(ct.name, v)} lang={ct.lang || c[ct.langName]} fixedLang={ct.lang != ""} setLang={(v:string) => props.setProp(ct.langName, v)}/>);
            break;
        case TypePropType.typeContent:
            extra.push(<TypeContent content={v || []} onChange={v => props.setProp(ct.name, v)} />);
            break;
        case TypePropType.monitorContent:
            extra.push(<MonitorContent content={v || []} onChange={v => props.setProp(ct.name, v)} />);
            break;
        }
    }

    return (
        <div>
            <InformationList key={props.id + props.current.version}>
                <InformationListRow name="Name"><TextField key="name" value={props.current.name} onChange={(e:any, value:string) => props.setName(value)} /></InformationListRow>
                <InformationListRow name="Comment"><TextField key="comment" fullWidth={true} multiLine={true} value={props.current.comment} onChange={(e:any, value:string) => props.setComment(value)} /></InformationListRow>
                {type.hasCatagory?<InformationListRow name="Catagory"><Catagory type={props.typeId} catagory={props.current.catagory} setCatagory={props.setCatagory} /></InformationListRow>:null}
                {rows}
                {type.hasTriggers?<InformationListRow name="Triggers" long={true}><Triggers triggers={c.triggers || []} setTriggers={triggers => props.setProp("triggers", triggers)} /></InformationListRow>:null}
                {type.hasVariables?<InformationListRow name="Variables" long={true}><Variables variables={c.variables || []} setVariables={(vars: {key:string, value:string}[])=> props.setProp("variables", vars)} /></InformationListRow>:null}
                {type.hasContains?<InformationListRow name={type.containsName || "Contains"} long={true}><ObjectSelector filter={(type,id)=>(type != hostId && type != typeId && type != rootId)} selected={c.contains?c.contains:[]} setSelected={(sel:number[]) => {props.setProp("contains",sel)}}/></InformationListRow>:null}
                {type.hasDepends?<InformationListRow name="Depends on" long={true}><ObjectSelector filter={(type, id) => (type != hostId && type != typeId && type != rootId)} selected={c.depends ? c.depends : []} setSelected={(sel: number[]) => { props.setProp("depends", sel) }}/></InformationListRow>:null}
                {type.hasSudoOn?<InformationListRow name="Sudo on" long={true}><ObjectSelector filter={(type, id) => (type == hostId)} selected={c.sudoOn ? c.sudoOn : []} setSelected={(sel: number[]) => { props.setProp("sudoOn", sel) }} /></InformationListRow>:null}
            </InformationList>
            {extra}
        </div>)
}

export const Type = connect(mapStateToProps, mapDispatchToProps)(TypeImpl);
