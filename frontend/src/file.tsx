import * as React from "react";
import {Class, ClassPropType} from './class'

export function File(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: true,
            hasTriggers: true,
            content: [
                {type: ClassPropType.text, title: "Path", name:"path",  description:"Where to store the file", default: ""} ,
                {type: ClassPropType.text, title: "User", name:"user",  description:"User to store as", default: ""},
                {type: ClassPropType.text, title: "Group", name:"group",  description:"Group to store as", default: ""},
                {type: ClassPropType.text, title: "Mode", name:"mode",  description:"Mode to use", default: "644"},
                {type: ClassPropType.document, title: "Data", name:"data",  description:"Mode to use", default: "644", langName:"lang"},
            ]
        }}/>;
}
