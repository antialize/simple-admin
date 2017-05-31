
import * as React from "react";
import {Class, ClassPropType} from './class'

export function User(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: true,
            hasVariables: true,
            hasContains: true,
            hasDepends: true,
            containsName: "Has",
            hasSudoOn: true,
            content: [
                {type: ClassPropType.text, title: "First Name", name:"firstName", description:"FirstName", default: ""},
                {type: ClassPropType.text, title: "Last Name", name:"lastName", description:"LastName", default: ""},
                {type: ClassPropType.text, title: "Email", name:"email", description:"Email", default: ""},
                {type: ClassPropType.text, title: "Shell", name:"shell", description:"Shell", default: "/bin/bash"},
                {type: ClassPropType.bool, title: "System", name:"system", description:"Should it be a system user", default: false},
                {type: ClassPropType.bool, title: "Sudo", name:"sudo", description:"Sudo", default: false},
                {type: ClassPropType.bool, title: "Admin", name:"admin", description:"Allow login into simpleadmin", default: false},
                {type: ClassPropType.password, title: "Password", name:"password", description:"The password to log in with", default: ""},                
                {type: ClassPropType.text, title: "Groups", name:"groups", description:"Groups the user is member of", default: ""},                
            ]
        }}/>;
}
