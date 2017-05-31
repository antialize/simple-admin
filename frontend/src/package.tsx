import * as React from "react";
import {Class, ClassPropType} from './class'

export function Package(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: false,
            hasVariables: false,
            hasContains: false,
            containsName: "Contains",
            content: []
        }}/>;
}
