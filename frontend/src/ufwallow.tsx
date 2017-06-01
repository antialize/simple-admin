import * as React from "react";
import {Class, ClassPropType} from './class'

export function UFWAllow(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: false,
            hasVariables: false,
            hasContains: false,
            containsName: "Contains",
            content: [
                {type: ClassPropType.text, name: "allow", title: "Allow", default:"", description: "ufw allow *", template: false, variable:""}
            ]
        }}/>;
}
