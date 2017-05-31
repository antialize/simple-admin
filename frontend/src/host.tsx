import * as React from "react";
import {Class, ClassPropType} from './class'

export function Host(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: true,
            hasVariables: true,
            hasContains: true,
            containsName: "Has",
            content: [
                {type: ClassPropType.password, title:"Password", name:"password", description: "The password the python client connects with"},
                {type: ClassPropType.bool, title: "Message on down", name:"messageOnDown",  description:"Should we generate messages when the server goes down", default: true},
            ]
        }}/>;
}

