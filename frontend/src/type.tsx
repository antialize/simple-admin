import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import Catagory from './catagory'
import {Password} from './password'
import Editor from './editor'
import TypeContent from './typeContent'
import MonitorContent from './monitorContent'
import {TypePropType, hostId, rootId} from '../../shared/type'
import state from "./state";
import { observer } from "mobx-react";
import ObjectSelector from "./object_selector"
import Triggers from './triggers'
import Variables from './variables'

export default observer(({typeId, id}:{typeId:number, id:number}) => {
    const obj = state.objects.get(id);
    const current = obj.current;
    const type = state.types && state.types.has(typeId) && state.types.get(typeId).content;
    if (!type)
        return <div>Missing type</div>;
    if (!current || !current.content)
        return <div>Missing content</div>;

    const c = current.content as {[key:string]:any};
    let rows = [];
    let extra = [];
    const setProp = (name:string, v:any) => {
        c[name] = v;
        obj.touched = true;
    }
    for (const ct of (type && type.content) || []) {
        if (ct.type == TypePropType.none) continue;
        let v = c[ct.name];

        switch (ct.type) {
        case TypePropType.password:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Password value={v==undefined?"":v} onChange={value => c[ct.name] = setProp(ct.name,value)}/></InformationListRow>);
            break;
        case TypePropType.bool:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Toggle title={ct.description} toggled={v==undefined?ct.default:v} onToggle={(e:any, value:boolean) => setProp(ct.name,value)}/></InformationListRow>);
            break;
        case TypePropType.text:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><TextField value={v==undefined?ct.default:v} fullWidth={ct.lines && ct.lines > 0} multiLine={ct.lines && ct.lines > 1} rows={ct.lines || 1} onChange={(e: any, value: string) => setProp(ct.name,  value)}  hintText={ct.description}/></InformationListRow>);
            break;
        case TypePropType.number:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><TextField value={v==undefined?""+ct.default:""+v} onChange={(e: any, value: string) => setProp(ct.name,  +value)}  hintText={ct.description}/></InformationListRow>);
            break;
        case TypePropType.choice:
            rows.push(
                <InformationListRow key={ct.name} name={ct.title}>
                    <SelectField value={v==undefined?ct.default:v} onChange={(a: any, b: any, value:string) => setProp(ct.name,  value)} hintText={ct.description}>
                        {ct.choices.map(n =><MenuItem value={n} primaryText={n} />)}
                    </SelectField>
                </InformationListRow>);
            break;
        case TypePropType.document:
            extra.push(<Editor title={ct.title} key={ct.name} data={v==undefined?"":v} setData={(v:string) => setProp(ct.name, v)} lang={ct.lang || c[ct.langName]} fixedLang={ct.lang != ""} setLang={(v:string) => setProp(ct.langName, v)}/>);
            break;
        case TypePropType.typeContent:
            extra.push(<TypeContent content={v || []} onChange={v => setProp(ct.name, v)} />);
            break;
        case TypePropType.monitorContent:
            extra.push(<MonitorContent content={v || []} onChange={v => setProp(ct.name, v)} />);
            break;
        }
    }

    return (
        <div>
            <InformationList key={id + current.version}>
                <InformationListRow name="Name"><TextField key="name" value={current.name} onChange={(e:any, value:string) => {current.name = value; obj.touched = true;}} /></InformationListRow>
                <InformationListRow name="Comment"><TextField key="comment" fullWidth={true} multiLine={true} value={current.comment} onChange={(e:any, value:string) => {current.comment = value; obj.touched = true;}}/></InformationListRow>
                {type.hasCatagory?<InformationListRow name="Catagory"><Catagory type={typeId} catagory={current.catagory} setCatagory={(cat:string) => {current.catagory = cat; obj.touched=true}} /></InformationListRow>:null}
                {rows}
                {type.hasTriggers?<InformationListRow name="Triggers" long={true}><Triggers triggers={c.triggers || []} setTriggers={triggers => setProp("triggers", triggers)} /></InformationListRow>:null}
                {type.hasVariables?<InformationListRow name="Variables" long={true}><Variables variables={c.variables || []} setVariables={(vars: {key:string, value:string}[])=> setProp("variables", vars)} /></InformationListRow>:null}
                {type.hasContains?<InformationListRow name={type.containsName || "Contains"} long={true}><ObjectSelector filter={(type,id)=>(type != hostId && type != typeId && type != rootId)} selected={c.contains?c.contains:[]} setSelected={(sel:number[]) => {setProp("contains",sel)}}/></InformationListRow>:null}
                {type.hasDepends?<InformationListRow name="Depends on" long={true}><ObjectSelector filter={(type, id) => (type != hostId && type != typeId && type != rootId)} selected={c.depends ? c.depends : []} setSelected={(sel: number[]) => { setProp("depends", sel) }}/></InformationListRow>:null}
                {type.hasSudoOn?<InformationListRow name="Sudo on" long={true}><ObjectSelector filter={(type, id) => (type == hostId)} selected={c.sudoOn ? c.sudoOn : []} setSelected={(sel: number[]) => { setProp("sudoOn", sel) }} /></InformationListRow>:null}
               </InformationList>
            {extra}
        </div>);
});
    

