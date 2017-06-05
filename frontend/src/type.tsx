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
import {ACTION, ISetObjectName, ISetObjectContentParam, ISetObjectCatagory} from '../../shared/actions'
import {ObjectSelector} from './object_selector'
import {Variables} from './variables'
import {Catagory} from './catagory'
import {Password} from './password'
import {Triggers} from './triggers';
import Editor from './editor'

import {IType, ITypeProp, TypePropType, hostId} from '../../shared/type'

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

function TypeContent(p: {content: ITypeProp[], onChange: (v: ITypeProp[])=>void}) {
    let rows = [];
    let c = p.content.slice(0);
    c.push({type: TypePropType.none});

    for (let i = 0; i < c.length; ++i) {
        const r = c[i];
        if (r.type == TypePropType.none && i +1 != c.length) continue;

        const changeType = (type: TypePropType) => {
            if (r && type == r.type) return;
            c[i] = {type} as ITypeProp;
            p.onChange(c);
        };

        const change = (o:{[key:string]:any}) => {
            c[i] = Object.assign({}, r || {}, o) as ITypeProp;
            p.onChange(c.filter(c=>c.type != TypePropType.none));
        };
        let def;
        if (r.type == TypePropType.none || r.type == TypePropType.typeContent || r.type == TypePropType.document || r.type == TypePropType.password)
            def = <TextField value="" disabled={true}/>;
        else if (r.type == TypePropType.bool) {
            def = (
                <SelectField value={!!r.default} onChange={(a, b, value) => change({default: value})}>
                    <MenuItem value={true} primaryText="On" />
                    <MenuItem value={false} primaryText="Off" />
                </SelectField>
            );
        } else if (r.type == TypePropType.choice) {
            def = (
                <SelectField value={r.default || ""} onChange={(a, b, value) => change({default: value})} disabled={!r.choices || r.choices.length == 0}>
                    {(r.choices || [""]).map(v=> <MenuItem value={v} primaryText={v} key={v}/> )}
                </SelectField>
            );
        } else {
            def = <TextField value={r.default} onChange={(a,value)=>change({default: value})}/>;
        }
        let temp;
        if (r.type == TypePropType.text || r.type == TypePropType.document) 
            temp = <Toggle key="template" toggled={r.template} onToggle={(a,value)=>change({template: value})}/>;
        else
            temp = <Toggle key="template" toggled={false} disabled={true}/>;
        let var_;
        if (r.type == TypePropType.text || r.type == TypePropType.choice || r.type == TypePropType.bool)
            var_ = <TextField key="var" value={r.variable} onChange={(a, value) => change({variable: value})}/>;
        else
            var_ = <TextField key="var" value="" disabled={true} />;
        let extra = null;
        if (r.type == TypePropType.choice)
            extra = <TextField hintText="Choices" value={((r.choices) || []).join(", ").trim()} onChange={(a, value) => change({choices: value.split(",").map(v=>v.trim())})}/>;
        else if (r.type == TypePropType.document)
            extra = <span>
                <TextField key="langname" hintText="LangName" value={r.langName || ""} onChange={(a, value) => change({langName: value})}/>
                <TextField key="lang" hintText="Lang" value={r.lang || ""} onChange={(a, value) => change({lang: value})}/>
                </span>;
        else if (r.type == TypePropType.text)
            extra = <Toggle key="deploytitle" toggled={r.deployTitle} onToggle={(a,value)=>change({deployTitle: value})} title="Deploy title" name="Deploy title"/>;

        rows.push(
            <tr key={i}>
                <td>
                    <SelectField value={r.type} onChange={(a, b, value) => changeType(value)}>
                        <MenuItem value={TypePropType.bool} primaryText="Bool" />
                        <MenuItem value={TypePropType.text} primaryText="Text" />
                        <MenuItem value={TypePropType.password} primaryText="Password" />
                        <MenuItem value={TypePropType.document} primaryText="Document" />
                        <MenuItem value={TypePropType.choice} primaryText="Choice" />
                        <MenuItem value={TypePropType.typeContent} primaryText="Type Content" />
                        <MenuItem value={TypePropType.none} primaryText="Nothing" />
                    </SelectField>
                </td>
                <td><TextField value={r.type != TypePropType.none && r.name || ""} disabled={r.type == TypePropType.none} onChange={(a, value) => change({name: value})}/></td>
                <td><TextField value={r.type != TypePropType.none && r.type != TypePropType.typeContent && r.title || ""} disabled={r.type == TypePropType.none || r.type == TypePropType.typeContent} onChange={(a, value) => change({title: value})}/></td>
                <td>{def}</td>
                <td>{temp}</td>
                <td>{var_}</td>
                <td><TextField value={r.type != TypePropType.none && r.type != TypePropType.typeContent && r.description || ""} disabled={r.type == TypePropType.none || r.type == TypePropType.typeContent} onChange={(a, value) => change({description: value})}/></td>
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
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Toggle alt={ct.description} toggled={v==undefined?ct.default:v} onToggle={(e:any, value:boolean) => props.setProp(ct.name,value)}/></InformationListRow>);
            break;
        case TypePropType.text:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><TextField value={v==undefined?ct.default:v} onChange={(e: any, value: string) => props.setProp(ct.name,  value)}  hintText={ct.description}/></InformationListRow>);
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
            extra.push(<Editor key={ct.name} data={v==undefined?"":v} setData={(v:string) => props.setProp(ct.name, v)} lang={ct.lang || c[ct.langName]} fixedLang={ct.lang != ""} setLang={(v:string) => props.setProp(ct.langName, v)}/>);
            break;
        case TypePropType.typeContent:
            extra.push(<TypeContent content={v || []} onChange={v => props.setProp(ct.name, v)} />);
            break;
        }
    }

    return (
        <div>
            <InformationList key={props.id + props.current.version}>
                <InformationListRow name="Name"><TextField key="name" value={props.current.name} onChange={(e:any, value:string) => props.setName(value)} /></InformationListRow>
                {type.hasCatagory?<InformationListRow name="Catagory"><Catagory type={props.typeId} catagory={props.current.catagory} setCatagory={props.setCatagory} /></InformationListRow>:null}
                {rows}
                {type.hasTriggers?<InformationListRow name="Triggers" long={true}><Triggers triggers={c.triggers || []} setTriggers={triggers => props.setProp("triggers", triggers)} /></InformationListRow>:null}
                {type.hasVariables?<InformationListRow name="Variables" long={true}><Variables variables={c.variables || []} setVariables={(vars: {key:string, value:string}[])=> props.setProp("variables", vars)} /></InformationListRow>:null}
                {type.hasContains?<InformationListRow name={type.containsName || "Contains"} long={true}><ObjectSelector filter={(type,id)=>type!='host'} selected={c.contains?c.contains:[]} setSelected={(sel:number[]) => {props.setProp("contains",sel)}}/></InformationListRow>:null}
                {type.hasDepends?<InformationListRow name="Depends on" long={true}><ObjectSelector filter={(type, id) => (type != 'host')} selected={c.depends ? c.depends : []} setSelected={(sel: number[]) => { props.setProp("depends", sel) }}/></InformationListRow>:null}
                {type.hasSudoOn?<InformationListRow name="Sudo on" long={true}><ObjectSelector filter={(type, id) => (type == 'host')} selected={c.sudoOn ? c.sudoOn : []} setSelected={(sel: number[]) => { props.setProp("sudoOn", sel) }} /></InformationListRow>:null}
            </InformationList>
            {extra}
        </div>)
}

export const Type = connect(mapStateToProps, mapDispatchToProps)(TypeImpl);
