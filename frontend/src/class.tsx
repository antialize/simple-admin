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
    none, bool, text, password, document, choice, classContent
}

export interface IBoolClassProp {
    type: ClassPropType.bool;
    title: string;
    name: string;
    description: string;
    default: boolean;
    variable: string;
}

export interface ITextClassProp {
    type: ClassPropType.text;
    title: string;
    name: string;
    description: string;
    default: string;
    template: boolean;
    variable: string;
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
    lang: string;
    description: string;
    template: boolean;
}

export interface IChoiceClassProp {
    type: ClassPropType.choice;
    title: string;
    name: string;
    description: string;
    default: string;
    choices: string[];
    variable: string;
}

export interface IClassContentClassProp {
    type: ClassPropType.classContent;
    name: string;
}

export interface INoneClassProp {
    type: ClassPropType.none;
}

export type IClassProp = IBoolClassProp | ITextClassProp | IPasswordClassProp | IDocumentClassProp | IChoiceClassProp | IClassContentClassProp | INoneClassProp;

export interface IClass {
    hasCatagory?: boolean;
    hasVariables?: boolean;
    hasContains?: boolean;
    hasSudoOn?: boolean;
    hasTriggers?: boolean;
    hasDepends?: boolean;
    containsName?: string;
    nameVariable?: string
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

function ClassContent(p: {content: IClassProp[], onChange: (v: IClassProp[])=>void}) {
    let rows = [];
    let c = p.content.slice(0);
    c.push({type: ClassPropType.none});

    for (let i = 0; i < c.length; ++i) {
        const r = c[i];
        if (r.type == ClassPropType.none && i +1 != c.length) continue;

        const changeType = (type: ClassPropType) => {
            if (r && type == r.type) return;
            c[i] = {type} as IClassProp;
            p.onChange(c);
        };

        const change = (o:{[key:string]:any}) => {
            c[i] = Object.assign({}, r || {}, o) as IClassProp;
            p.onChange(c.filter(c=>c.type != ClassPropType.none));
        };
        let def;
        if (r.type == ClassPropType.none || r.type == ClassPropType.classContent || r.type == ClassPropType.document || r.type == ClassPropType.password)
            def = <TextField value="" disabled={true}/>;
        else if (r.type == ClassPropType.bool) {
            def = (
                <SelectField value={!!r.default} onChange={(a, b, value) => change({default: value})}>
                    <MenuItem value={true} primaryText="On" />
                    <MenuItem value={false} primaryText="Off" />
                </SelectField>
            );
        } else if (r.type == ClassPropType.choice) {
            def = (
                <SelectField value={r.default || ""} onChange={(a, b, value) => change({default: value})} disabled={!r.choices || r.choices.length == 0}>
                    {(r.choices || [""]).map(v=> <MenuItem value={v} primaryText={v} key={v}/> )}
                </SelectField>
            );
        } else {
            def = <TextField value={r.default} onChange={(a,value)=>change({default: value})}/>;
        }
        let temp;
        if (r.type == ClassPropType.text || r.type == ClassPropType.document) 
            temp = <Toggle toggled={r.template} onToggle={(a,value)=>change({template: value})}/>;
        else
            temp = <Toggle toggled={false} disabled={true}/>;
        let var_;
        if (r.type == ClassPropType.text || r.type == ClassPropType.choice || r.type == ClassPropType.bool) 
            var_ = <TextField value={r.variable} onChange={(a, value) => change({variable: value})}/>;
        else
            var_ = <TextField value="" disabled={true} />;
        let extra = null;
        if (r.type == ClassPropType.choice)
            extra = <TextField hintText="Choices" value={((r.choices) || []).join(", ").trim()} onChange={(a, value) => change({choices: value.split(",").map(v=>v.trim())})}/>;
        else if (r.type == ClassPropType.document)
            extra = <span>
                <TextField hintText="LangName" value={r.langName || ""} onChange={(a, value) => change({langName: value})}/>
                <TextField hintText="Lang" value={r.lang || ""} onChange={(a, value) => change({lang: value})}/>
                </span>;

        rows.push(
            <tr key={i}>
                <td>
                    <SelectField value={r.type} onChange={(a, b, value) => changeType(value)}>
                        <MenuItem value={ClassPropType.bool} primaryText="Bool" />
                        <MenuItem value={ClassPropType.text} primaryText="Text" />
                        <MenuItem value={ClassPropType.password} primaryText="Password" />
                        <MenuItem value={ClassPropType.document} primaryText="Document" />
                        <MenuItem value={ClassPropType.choice} primaryText="Choice" />
                        <MenuItem value={ClassPropType.classContent} primaryText="Class Content" />
                        <MenuItem value={ClassPropType.none} primaryText="Nothing" />                    
                    </SelectField>
                </td>
                <td><TextField value={r.type != ClassPropType.none && r.name || ""} disabled={r.type == ClassPropType.none} onChange={(a, value) => change({name: value})}/></td>
                <td><TextField value={r.type != ClassPropType.none && r.type != ClassPropType.classContent && r.title || ""} disabled={r.type == ClassPropType.none || r.type == ClassPropType.classContent} onChange={(a, value) => change({title: value})}/></td>
                <td>{def}</td>
                <td>{temp}</td>
                <td>{var_}</td>
                <td><TextField value={r.type != ClassPropType.none && r.type != ClassPropType.classContent && r.description || ""} disabled={r.type == ClassPropType.none || r.type == ClassPropType.classContent} onChange={(a, value) => change({description: value})}/></td>
                <td>{extra}</td>
            </tr>);
    }

    return (
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Default</th>
                    <th>Template</th>
                    <th>Variable</th>
                    <th>Description</th>
                    <th>Extra</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>);
}

function ClassImpl(props: StateProps & DispactProps) {
    const cls = props.cls;
    const c = props.current.content as {[key:string]:any};
    let rows = [];
    let extra = [];
    for (const ct of cls.content) {
        if (ct.type == ClassPropType.none) continue;
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
                <InformationListRow key={ct.name} name={ct.title}>
                    <SelectField value={v==undefined?ct.default:v} onChange={(a: any, b: any, value:string) => props.setProp(ct.name,  value)} hintText={ct.description}>
                        {ct.choices.map(n =><MenuItem value={n} primaryText={n} />)}
                    </SelectField>
                </InformationListRow>);
            break;
        case ClassPropType.document:
            extra.push(<Editor key={ct.name} data={v==undefined?"":v} setData={(v:string) => props.setProp(ct.name, v)} lang={ct.lang || c[ct.langName]} fixedLang={ct.lang != ""} setLang={(v:string) => props.setProp(ct.langName, v)}/>);
            break;
        case ClassPropType.classContent:
            extra.push(<ClassContent content={v || []} onChange={v => props.setProp(ct.name, v)} />);
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
