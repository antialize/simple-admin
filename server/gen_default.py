from dataclasses import dataclass
import sqlite3
import json
from typing import Any


@dataclass
class Default:
    id: int
    name: str
    shared: bool = False


defaults: list[Default] = [
    Default(id=1, name="type", shared=True),
    Default(id=2, name="host", shared=True),
    Default(id=3, name="root", shared=True),
    Default(id=7, name="collection"),
    Default(id=8, name="complexCollection"),
    Default(id=6, name="file"),
    Default(id=4, name="user", shared=True),
    Default(id=5, name="group"),
    Default(id=9, name="ufwAllow"),
    Default(id=50, name="reloadServiceTrigger"),
    Default(id=51, name="restartServiceTrigger"),
    Default(id=52, name="runTrigger"),
    Default(id=10, name="package"),
    Default(id=10240, name="cron"),
    Default(id=10616, name="fstab"),
    Default(id=10840, name="hostVariable"),
    Default(id=10675, name="limit"),
    Default(id=10072, name="run"),
    Default(id=52, name="shellTrigger"),
    Default(id=10206, name="systemdService"),
    Default(id=100, name="rootInstance", shared=True),
]

IN_ROOT = 1
IN_CONTENT = 2
IN_CONTENT_LIST = 3

content_types = {
    0: "none",
    1: "bool",
    2: "text",
    3: "password",
    4: "document",
    5: "choice",
    6: "typeContent",
    7: "number",
}


def ts_json(v: Any, l: int, state: int) -> None:
    if isinstance(v, dict):
        if not v:
            return "{}"
        r = "{\n"
        t = None
        for k, vv in v.items():
            if state == IN_CONTENT_LIST and k == "type":
                if vv == 0:
                    continue
                tt = content_types[vv]
                vv = f"TypePropType.{tt}"
                t = "I" + tt[0].upper() + tt[1:] + "TypeProp"
            else:
                vv = ts_json(
                    vv, l + 1, IN_CONTENT if k == "content" and state == IN_ROOT else 0
                )
            r += f"{"    "*l}    {k}: {vv},\n"
        if t is None:
            return f"{r}{"    "*l}}}"
        else:
            return f"{r}{"    "*l}}} as {t}"
    if isinstance(v, list):
        if not v:
            return "[]"
        r = "[\n"
        for vv in v:
            r += f"{"    "*l}    {ts_json(vv, l+1, IN_CONTENT_LIST if state==IN_CONTENT else 0)},\n"
        return f"{r}{"    "*l}]"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if v is None:
        return "null"
    if isinstance(v, str):
        if "\n" not in v:
            return json.dumps(v)
        r = "\n"
        lines = v.split("\n")
        for line in lines[:-1]:
            r += f"{"    "*l}    {json.dumps(line+"\n")} +\n"
        if not lines[-1]:
            r = r[:-3]
        else:
            r += f"{"    "*l}    {json.dumps(lines[-1])}"
        return r
    return str(v)


def main() -> None:
    con = sqlite3.connect("sysadmin.db")

    print(
        """import {
    type IBoolTypeProp,
    type IChoiceTypeProp,
    type IDocumentTypeProp,
    type INumberTypeProp,
    type IPasswordTypeProp,
    type ITextTypeProp,
    type IType,
    type ITypeContentTypeProp,
    TypePropType,"""
    )

    for d in defaults:
        if d.shared:
            print(f"    {d.name}Id,")

    print(
        """} from "./shared/type";
"""
    )

    for d in defaults:
        if not d.shared:
            print(f"export const {d.name}Id = {d.id};")

    print(
        """
interface IDefault {
    type: number;
    id: number;
    name: string;
    category: string;
    content: object;
    comment: string;
}

export const defaults: IDefault[] = ["""
    )
    for d in defaults:
        cur = con.cursor()
        cur.execute(
            "SELECT `name`, `type`, `content`, `category`, `comment` FROM `objects` WHERE `id`=? AND `newest`",
            (d.id,),
        )
        row = cur.fetchone()
        content: dict = json.loads(row[2])
        if "secrets" in content:
            content["secrets"] = []
        if "variables" in content:
            content["variables"] = []
        if row[1] == 1:
            t = "typeId"
        elif row[1] == 3:
            t = "rootId"
        else:
            t = int(row[1])
        print(
            f"""    {{
        type: {t},
        id: {d.name}Id,
        name: {json.dumps(row[0])},
        category: {json.dumps(row[3])},
        comment: {json.dumps(row[4])},
        content: {ts_json(content, 2, IN_ROOT)}{" as IType" if row[1] == 1 else ""}
        """
        )
        print("    },")

    print("];")


main()
