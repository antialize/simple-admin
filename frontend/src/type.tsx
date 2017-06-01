import * as React from "react";
import {Class, ClassPropType} from './class'

export function Type(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: true,
            content: [
                {type: ClassPropType.text, title: "Plural", name:"plural", description:"Plural of name", default: ""},
                {type: ClassPropType.choice, title: "Kind", name:"kind", description:"", default:"delta", choices:["delta", "trigger", "host", "accumulate", "catagory"]},
                {type: ClassPropType.bool, title: "Has catagory", name:"hasCatagory", description:"", default: false},
                {type: ClassPropType.bool, title: "Has variables", name:"hasVariables", description:"", default: false},
                {type: ClassPropType.bool, title: "Has triggers", name:"hasTriggers", description:"", default: false},
                {type: ClassPropType.bool, title: "Has depends", name:"hasDepends", description:"", default: false},
                {type: ClassPropType.bool, title: "Has sudo on", name:"hasSudoOn", description:"", default: false},
                {type: ClassPropType.bool, title: "Has contains", name:"hasContains", description:"", default: false},
                {type: ClassPropType.text, title: "Contains name", name:"contairsName", description:"", default: "Has"},
                {type: ClassPropType.classContent, name:"content"},  
                {type: ClassPropType.document, title: "Script", name:"script", description:"", langName:"scriptLang"}                
            ]
        }}/>;
}