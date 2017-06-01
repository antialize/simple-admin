import * as React from "react";
import {Class, ClassPropType} from './class'

export function File(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: true,
            hasTriggers: true,
            content: [
                {type: ClassPropType.text, title: "Path", name:"path",  description:"Where to store the file", default: "", template:true, variable:"path"},
                {type: ClassPropType.text, title: "User", name:"user",  description:"User to store as", default: "", template:true, variable:""},
                {type: ClassPropType.text, title: "Group", name:"group",  description:"Group to store as", default: "", template:true, variable:""},
                {type: ClassPropType.text, title: "Mode", name:"mode",  description:"Mode to use", default: "644", template:true, variable:""},
                {type: ClassPropType.document, title: "Data", name:"data",  description:"Mode to use", default: "644", langName:"lang", lang:"", template:true, variable:""},
            ]
        }}/>;
}
