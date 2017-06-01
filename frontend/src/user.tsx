import { Variables } from './variables';

import * as React from "react";
import {Class, ClassPropType, ITextClassProp, IBoolClassProp, IPasswordClassProp} from './class'

export function User(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: true,
            hasVariables: true,
            hasContains: true,
            hasDepends: true,
            containsName: "Has",
            hasSudoOn: true,
            nameVariable: "user",
            content: [
                {type: ClassPropType.text, title: "First Name", name:"firstName", description:"FirstName", default: "", template:false, variable:"firstName"} as ITextClassProp,
                {type: ClassPropType.text, title: "Last Name", name:"lastName", description:"LastName", default: "", template:false, variable:"lastName"} as ITextClassProp,
                {type: ClassPropType.text, title: "Email", name:"email", description:"Email", default: "", template:false, variable:"email"} as ITextClassProp,
                {type: ClassPropType.text, title: "Shell", name:"shell", description:"Shell", default: "/bin/bash", template:true, variable:""} as ITextClassProp,
                {type: ClassPropType.bool, title: "System", name:"system", description:"Should it be a system user", default: false, template: false, variable:""} as IBoolClassProp,
                {type: ClassPropType.bool, title: "Sudo", name:"sudo", description:"Sudo", default: false, template:false, variable:""} as IBoolClassProp,
                {type: ClassPropType.bool, title: "Admin", name:"admin", description:"Allow login into simpleadmin", default: false, template:false, variable:""} as IBoolClassProp,
                {type: ClassPropType.password, title: "Password", name:"password", description:"The password to log in with"} as IPasswordClassProp,                
                {type: ClassPropType.text, title: "Groups", name:"groups", description:"Groups the user is member of", default: "", template:true, variable:"" } as ITextClassProp,                
            ]
        }}/>;
}
