import * as React from "react";
import {Class, ClassPropType, IPasswordClassProp, IBoolClassProp} from './class'

export function Host(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: true,
            hasVariables: true,
            hasContains: true,
            containsName: "Has",
            nameVariable: "host",
            content: [
                {type: ClassPropType.password, title:"Password", name:"password", description: "The password the python client connects with"} as IPasswordClassProp,
                {type: ClassPropType.bool, title: "Message on down", name:"messageOnDown",  description:"Should we generate messages when the server goes down", default: true, template: false, variable: ""} as IBoolClassProp,
            ]
        }}/>;
}

