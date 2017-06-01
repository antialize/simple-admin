import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';

import {IObject} from '../../shared/state'
import {IMainState} from './reducers';
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import {ACTION, ISetObjectName, ISetObjectContentParam, ISetObjectCatagory} from '../../shared/actions'
import {ObjectSelector} from './object_selector'
import {Variables} from './variables'
import {Catagory} from './catagory'
import {Password} from './password'
import {Triggers} from './triggers';
import Editor from './editor'

export enum ClassPropType {
    bool, text, password, document, choice, classContent
}

export interface IBoolClassProp {
    type: ClassPropType.bool;
    title: string;
    name: string;
    description: string;
    default: boolean;
}

export interface ITextClassProp {
    type: ClassPropType.text;
    title: string;
    name: string;
    description: string;
    default: string;
}

export interface IPasswordClassProp {
    type: ClassPropType.password;
    title: string;
    name: string;
    description: string;
}

export interface IDocumentClassProp {
    type: ClassPropType.document;
    title: string;
    name: string;
    langName: string;
    description: string;
}

export interface IChoiceClassProp {
    type: ClassPropType.choice;
    title: string;
    name: string;
    description: string;
    default: string;
    choices: string[];
}

export interface IClassContentClassProp {
    type: ClassPropType.classContent;
    name: string;
}

export type IClassProp = IBoolClassProp | ITextClassProp | IPasswordClassProp | IDocumentClassProp | IChoiceClassProp | IClassContentClassProp;

export interface IClass {
    hasCatagory?: boolean;
    hasVariables?: boolean;
    hasContains?: boolean;
    hasSudoOn?: boolean;
    hasTriggers?: boolean;
    hasDepends?: boolean;
    containsName?: string;
    content: IClassProp[];
}


interface IProps {
    id: number;
    cls: IClass;
}

interface StateProps {
    current: IObject;
    id: number;
    cls: IClass;
}

interface DispactProps {
    setCatagory: (name: string) => void;
    setName: (name: string) => void;
    setProp: (prop:string, value:any) => void;
}

function mapStateToProps(s:IMainState, p: IProps): StateProps {
    return {current: s.objects[p.id].current, id: p.id, cls: p.cls};
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

function ClassImpl(props: StateProps & DispactProps) {
    const cls = props.cls;
    const c = props.current.content as {[key:string]:any};
    let rows = [];
    let extra = [];
    for (const ct of cls.content) {
        let v = c[ct.name];
        switch (ct.type) {
        case ClassPropType.password:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Password value={v==undefined?"":v} onChange={value => props.setProp(ct.name,value)}/></InformationListRow>);
            break;
        case ClassPropType.bool:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Toggle alt={ct.description} toggled={v==undefined?ct.default:v} onToggle={(e:any, value:boolean) => props.setProp(ct.name,value)}/></InformationListRow>);
            break;
        case ClassPropType.text:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><TextField value={v==undefined?ct.default:v} onChange={(e: any, value: string) => props.setProp(ct.name,  value)}  hintText={ct.description}/></InformationListRow>);
            break;
        case ClassPropType.choice:
            rows.push(
                <InformationListRow>
                    <SelectField value={v==undefined?ct.default:v} onChange={(a: any, b: any, value:string) => props.setProp(ct.name,  value)}  hintText={ct.description}>
                        {ct.choices.map(n =><MenuItem value={n} primaryText={n} />)}
                    </SelectField>
                </InformationListRow>);
            break;
        case ClassPropType.document:
            extra.push(<Editor key={ct.name} data={v==undefined?"":v} setData={(v:string) => props.setProp(c[ct.name], v)} lang={c[ct.langName]} setLang={(v:string) => props.setProp(ct.langName, v)}/>);
            break;
        case ClassPropType.classContent:
            extra.push(<div>Class Content</div>)
            break;
        }
    }

    return (
        <div>
            <InformationList key={props.id + props.current.version}>
                <InformationListRow name="Name"><TextField key="name" value={props.current.name} onChange={(e:any, value:string) => props.setName(value)} /></InformationListRow>
                {cls.hasCatagory?<InformationListRow name="Catagory"><Catagory cls="host" catagory={props.current.catagory} setCatagory={props.setCatagory} /></InformationListRow>:null}
                {rows}
                {cls.hasTriggers?<InformationListRow name="Triggers" long={true}><Triggers triggers={c.triggers || []} setTriggers={triggers => props.setProp("triggers", triggers)} /></InformationListRow>:null}
                {cls.hasVariables?<InformationListRow name="Variables" long={true}><Variables variables={c.variables || []} setVariables={(vars: {key:string, value:string}[])=> props.setProp("variables", vars)} /></InformationListRow>:null}
                {cls.hasContains?<InformationListRow name={cls.containsName || "Contains"} long={true}><ObjectSelector filter={(cls,id)=>cls!='host'} selected={c.contains?c.contains:[]} setSelected={(sel:number[]) => {props.setProp("contains",sel)}}/></InformationListRow>:null}
                {cls.hasDepends?<InformationListRow name="Depends on" long={true}><ObjectSelector filter={(cls, id) => (cls != 'host')} selected={c.depends ? c.depends : []} setSelected={(sel: number[]) => { props.setProp("depends", sel) }}/></InformationListRow>:null}
                {cls.hasSudoOn?<InformationListRow name="Sudo on" long={true}><ObjectSelector filter={(cls, id) => (cls == 'host')} selected={c.sudoOn ? c.sudoOn : []} setSelected={(sel: number[]) => { props.setProp("sudoOn", sel) }} /></InformationListRow>:null}
            </InformationList>
            {extra}
        </div>)
}

export const Class = connect(mapStateToProps, mapDispatchToProps)(ClassImpl);
