import { Button } from "@mui/material";
import { observer } from "mobx-react";
import MenuDropdown, { DropDownItem } from "./MenuDropdown";
import { PAGE_TYPE, ROOT_ID, ROOT_INSTANCE_ID } from "./shared_types";
import state from "./state";

export const ObjectMenuList = observer(function ObjectMenuList({ type }: { type: number }) {
    const page = state.page;
    if (!page) return <span>Missing state.page</span>;
    const lst = [];
    const digests = state.objectDigests.get(type);
    if (digests !== undefined) {
        for (const [_, v] of digests) {
            lst.push(v);
        }
        lst.sort((l, r) => {
            return l.name < r.name ? -1 : 1;
        });
    }
    return (
        <>
            <DropDownItem
                key="new"
                onClick={(e) => {
                    page.onClick(e, { type: PAGE_TYPE.Object, objectType: type });
                }}
                href={page.link({ type: PAGE_TYPE.Object, objectType: type })}
            >
                new
            </DropDownItem>
            <DropDownItem
                key="list"
                onClick={(e) => {
                    page.onClick(e, { type: PAGE_TYPE.ObjectList, objectType: type });
                }}
                href={page.link({ type: PAGE_TYPE.ObjectList, objectType: type })}
            >
                list
            </DropDownItem>
            <DropDownItem />
            {lst.map((v) => (
                <DropDownItem
                    key={v.id}
                    onClick={(e) => {
                        page.onClick(e, {
                            type: PAGE_TYPE.Object,
                            objectType: type,
                            id: v.id,
                        });
                    }}
                    href={page.link({ type: PAGE_TYPE.Object, objectType: type, id: v.id })}
                >
                    {v.name}
                </DropDownItem>
            ))}
        </>
    );
});

const TypeMenuItem = observer(function TypeMenuItem({ id }: { id: number }) {
    const page = state.page;
    if (!page) return <span>Missing state.page</span>;
    const type = state.types.get(id);
    if (!type) return <span>Missing type</span>;
    const name = type.name;
    if (id === ROOT_ID) {
        return (
            <Button
                key={ROOT_INSTANCE_ID}
                onClick={(e) => {
                    page.onClick(e, {
                        type: PAGE_TYPE.Object,
                        objectType: ROOT_ID,
                        id: ROOT_INSTANCE_ID,
                    });
                }}
                href={page.link({
                    type: PAGE_TYPE.Object,
                    objectType: ROOT_ID,
                    id: ROOT_INSTANCE_ID,
                })}
            >
                {name}
            </Button>
        );
    }
    return (
        <MenuDropdown title={name}>
            <ObjectMenuList type={id} />
        </MenuDropdown>
    );
});

export default TypeMenuItem;
