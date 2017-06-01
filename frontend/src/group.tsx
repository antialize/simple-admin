import * as React from "react";
import {Class, ClassPropType} from './class'

export function Group(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: false,
            hasVariables: false,
            hasContains: false,
            containsName: "Contains",
            content: [
                {type: ClassPropType.bool, title: "System", name:"system",  description:"Is this a system group", default: false, template:false, variable:""},
            ]
        }}/>;
}
