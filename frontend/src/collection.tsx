import * as React from "react";
import {Class, ClassPropType} from './class'

export function Collection(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: false,
            hasVariables: true,
            hasContains: true,
            containsName: "Has",
            content: []
        }}/>;
}
