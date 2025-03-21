import { MenuItem, Select, Switch, TextField, Tooltip } from "@mui/material";
import { observer } from "mobx-react";
import Category from "./Category";
import Editor from "./Editor";
import DisplayError from "./Error";
import { InformationList, InformationListRow } from "./InformationList";
import ObjectSelector from "./ObjectSelector";
import Password from "./Password";
import Triggers from "./Triggers";
import TypeContent from "./TypeContent";
import Variables from "./Variables";
import { HOST_ID, ROOT_ID, TYPE_ID, TypePropType } from "./shared_types";
import state from "./state";

const Type = observer(function Type({ typeId: myType, id }: { typeId: number; id: number }) {
    const obj = state.objects.get(id);
    if (!obj) return <DisplayError>Missing object</DisplayError>;

    const current = obj.current;
    const typeOuter = state.types.get(myType);
    const type = typeOuter?.content;
    if (!type) return <DisplayError>Missing type</DisplayError>;
    if (!current?.content) return <DisplayError>Missing content</DisplayError>;

    const c = current.content as Record<string, any>;
    const rows = [];
    const extra = [];
    const setProp = (name: string, v: any) => {
        c[name] = v;
        obj.touched = true;
    };
    for (const ct of type?.content ?? []) {
        if (ct.type === TypePropType.none || ct.type === TypePropType.monitor) continue;
        const v = c[ct.name];

        switch (ct.type) {
            case TypePropType.password:
                rows.push(
                    <InformationListRow key={ct.name} name={ct.title}>
                        <Password
                            value={v ?? ""}
                            onChange={(value) => {
                                setProp(ct.name, value);
                            }}
                        />
                    </InformationListRow>,
                );
                break;
            case TypePropType.bool:
                rows.push(
                    <InformationListRow key={ct.name} name={ct.title}>
                        <Switch
                            title={ct.description}
                            checked={v ?? ct.default}
                            onChange={(e) => {
                                setProp(ct.name, e.target.checked);
                            }}
                        />
                    </InformationListRow>,
                );
                break;
            case TypePropType.text:
                rows.push(
                    <InformationListRow key={ct.name} name={ct.title}>
                        <Tooltip title={ct.description ?? ""}>
                            <TextField
                                variant="standard"
                                value={v ?? ct.default}
                                fullWidth={!!ct.lines && ct.lines > 0}
                                style={{ width: 400 }}
                                multiline={!!ct.lines && ct.lines > 1}
                                rows={ct.lines ?? 1}
                                onChange={(e) => {
                                    setProp(ct.name, e.target.value);
                                }}
                            />
                        </Tooltip>
                    </InformationListRow>,
                );
                break;
            case TypePropType.number:
                rows.push(
                    <InformationListRow key={ct.name} name={ct.title}>
                        <Tooltip title={ct.description}>
                            <TextField
                                variant="standard"
                                value={v === undefined ? `${ct.default}` : `${v}`}
                                onChange={(e) => {
                                    setProp(ct.name, +e.target.value);
                                }}
                            />
                        </Tooltip>
                    </InformationListRow>,
                );
                break;
            case TypePropType.choice:
                rows.push(
                    <InformationListRow key={ct.name} name={ct.title}>
                        <Tooltip title="ct.description">
                            <Select
                                variant="standard"
                                value={v ?? ct.default}
                                onChange={(e) => {
                                    setProp(ct.name, e.target.value);
                                }}
                            >
                                {ct.choices.map((n) => (
                                    <MenuItem key={n} value={n}>
                                        {n}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Tooltip>
                    </InformationListRow>,
                );
                break;
            case TypePropType.document:
                extra.push(
                    <Editor
                        title={ct.title}
                        key={ct.name}
                        data={v ?? ""}
                        setData={(v: string) => {
                            setProp(ct.name, v);
                        }}
                        lang={ct.lang ?? (ct.langName == null ? undefined : c[ct.langName])}
                        fixedLang={ct.lang != null && ct.lang !== ""}
                        setLang={(v: string) => {
                            if (ct.langName != null) setProp(ct.langName, v);
                        }}
                    />,
                );
                break;
            case TypePropType.typeContent:
                extra.push(
                    <TypeContent
                        key={ct.name}
                        content={v ?? []}
                        onChange={(v) => {
                            setProp(ct.name, v);
                        }}
                    />,
                );
                break;
        }
    }

    return (
        <div>
            <InformationList key={`${id}_${current.version ?? 0}`}>
                <InformationListRow name="Name" key="name">
                    <TextField
                        key="name"
                        variant="standard"
                        value={current.name}
                        onChange={(e) => {
                            current.name = e.target.value;
                            obj.touched = true;
                        }}
                    />
                </InformationListRow>
                <InformationListRow name="Comment" key="content">
                    <TextField
                        key="comment"
                        variant="standard"
                        fullWidth
                        multiline
                        value={current.comment}
                        onChange={(e) => {
                            current.comment = e.target.value;
                            obj.touched = true;
                        }}
                    />
                </InformationListRow>
                {type.hasCategory ? (
                    <InformationListRow name="Category" key="category">
                        <Category
                            type={myType}
                            category={current.category}
                            setCategory={(cat: string) => {
                                current.category = cat;
                                obj.touched = true;
                            }}
                        />
                    </InformationListRow>
                ) : null}
                {rows}
                {type.hasTriggers ? (
                    <InformationListRow name="Triggers" long={true} key="triggers">
                        <Triggers
                            triggers={c.triggers ?? []}
                            setTriggers={(triggers) => {
                                setProp("triggers", triggers);
                            }}
                        />
                    </InformationListRow>
                ) : null}
                {type.hasVariables ? (
                    <InformationListRow name="Variables" long={true} key="variabels">
                        <Variables
                            variables={c.variables ?? []}
                            setVariables={(vars: Array<{ key: string; value: string }>) => {
                                setProp("variables", vars);
                            }}
                        />
                    </InformationListRow>
                ) : null}
                {type.hasVariables ? (
                    <InformationListRow name="Secrets" long={true} key="secrets">
                        <Variables
                            variables={c.secrets ?? []}
                            setVariables={(vars: Array<{ key: string; value: string }>) => {
                                setProp("secrets", vars);
                            }}
                            secret
                        />
                    </InformationListRow>
                ) : null}
                {type.hasContains ? (
                    <InformationListRow
                        name={type.containsName ?? "Contains"}
                        long={true}
                        key="contains"
                    >
                        <ObjectSelector
                            filter={(type, _) =>
                                type !== HOST_ID && type !== TYPE_ID && type !== ROOT_ID
                            }
                            selected={c.contains ? c.contains : []}
                            setSelected={(sel: number[]) => {
                                setProp("contains", sel);
                            }}
                        />
                    </InformationListRow>
                ) : null}
                {type.hasDepends ? (
                    <InformationListRow name="Depends on" long={true} key="depends_on">
                        <ObjectSelector
                            filter={(type, _) =>
                                type !== HOST_ID && type !== TYPE_ID && type !== ROOT_ID
                            }
                            selected={c.depends ? c.depends : []}
                            setSelected={(sel: number[]) => {
                                setProp("depends", sel);
                            }}
                        />
                    </InformationListRow>
                ) : null}
                {type.hasSudoOn ? (
                    <InformationListRow name="Sudo on" long={true} key="sudo_on">
                        <ObjectSelector
                            filter={(type, _) => type === HOST_ID}
                            selected={c.sudoOn ? c.sudoOn : []}
                            setSelected={(sel: number[]) => {
                                setProp("sudoOn", sel);
                            }}
                        />
                    </InformationListRow>
                ) : null}
            </InformationList>
            {extra}
        </div>
    );
});

export default Type;
