import * as React from "react";
import Category from './Category';
import Editor from './Editor';
import MenuItem from "@material-ui/core/MenuItem";
import ObjectSelector from "./ObjectSelector";
import Password from './Password';
import Select from "@material-ui/core/Select";
import Switch from "@material-ui/core/Switch";
import TextField from "@material-ui/core/TextField";
import Tooltip from "@material-ui/core/Tooltip";
import Triggers from './Triggers';
import TypeContent from './TypeContent';
import Variables from './Variables';
import state from "./state";
import { InformationList, InformationListRow } from './InformationList';
import { observer } from "mobx-react";
import {TypePropType, hostId, rootId, typeId} from '../../shared/type';
import Error from './Error';

const Type = observer(function Type({typeId: myType, id}:{typeId:number, id:number}) {
    const obj = state.objects.get(id);
    if (!obj) return <Error>Missing object</Error>;

    const current = obj.current;
    const typeOuter = state.types.get(myType);
    const type = typeOuter && typeOuter.content;
    if (!type)
        return <Error>Missing type</Error>;
    if (!current || !current.content)
        return <Error>Missing content</Error>;

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
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Password value={v==undefined?"":v} onChange={value => setProp(ct.name,value)}/></InformationListRow>);
            break;
        case TypePropType.bool:
            rows.push(<InformationListRow key={ct.name} name={ct.title}><Switch title={ct.description} checked={v==undefined?ct.default:v} onChange={(e) => setProp(ct.name,e.target.checked)}/></InformationListRow>);
            break;
        case TypePropType.text:
            rows.push(<InformationListRow key={ct.name} name={ct.title}>
                    <Tooltip title={ct.description || ""}>
                        <TextField value={v==undefined?ct.default:v} fullWidth={!!ct.lines && ct.lines > 0} style={{width: 400}} multiline={!!ct.lines && ct.lines > 1} rows={ct.lines || 1} onChange={(e) => setProp(ct.name, e.target.value)}/>
                    </Tooltip>
                </InformationListRow>);
            break;
        case TypePropType.number:
            rows.push(<InformationListRow key={ct.name} name={ct.title}>
                    <Tooltip title={ct.description}>
                        <TextField value={v==undefined?""+ct.default:""+v} onChange={(e) => setProp(ct.name, +e.target.value)}/>
                    </Tooltip>
                </InformationListRow>);
            break;
        case TypePropType.choice:
            rows.push(
                <InformationListRow key={ct.name} name={ct.title}>
                    <Tooltip title="ct.description">
                        <Select value={v==undefined?ct.default:v} onChange={(e) => setProp(ct.name, e.target.value)}>
                            {ct.choices.map(n =><MenuItem value={n}>{n}</MenuItem>)}
                        </Select>
                    </Tooltip>
                </InformationListRow>);
            break;
        case TypePropType.document:
            extra.push(<Editor title={ct.title} key={ct.name} data={v==undefined?"":v} setData={(v:string) => setProp(ct.name, v)} lang={ct.lang || c[ct.langName]} fixedLang={ct.lang != null && ct.lang != ""} setLang={(v:string) => setProp(ct.langName, v)}/>);
            break;
        case TypePropType.typeContent:
            extra.push(<TypeContent key={ct.name} content={v || []} onChange={v => setProp(ct.name, v)} />);
            break;
        }
    }

    return (
        <div>
            <InformationList key={id + "_" + (current.version || 0)}>
                <InformationListRow name="Name"><TextField key="name" value={current.name} onChange={(e) => {current.name = e.target.value; obj.touched = true;}} /></InformationListRow>
                <InformationListRow name="Comment"><TextField key="comment" fullWidth multiline value={current.comment} onChange={(e) => {current.comment = e.target.value; obj.touched = true;}}/></InformationListRow>
                {type.hasCategory?<InformationListRow name="Category"><Category type={myType} category={current.category} setCategory={(cat:string) => {current.category = cat; obj.touched=true}} /></InformationListRow>:null}
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

export default Type;
