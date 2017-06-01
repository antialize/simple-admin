import * as React from "react";
import {Class, ClassPropType, ITextClassProp, IBoolClassProp, IChoiceClassProp, IClassContentClassProp, IDocumentClassProp} from './class'

export function Type(props: {id:number}) {
    return <Class id={props.id}
        cls={{
            hasCatagory: true,
            content: [
                {type: ClassPropType.text, title: "Name variable", name:"nameVariable", description:"nameVariable", default: "", template:false, variable:""} as ITextClassProp,
                {type: ClassPropType.text, title: "Plural", name:"plural", description:"Plural of name", default: "", template:false, variable:""} as ITextClassProp,
                {type: ClassPropType.choice, title: "Kind", name:"kind", description:"", default:"delta", choices:["delta", "trigger", "host", "accumulate", "catagory", "root", "type"]} as IChoiceClassProp,
                {type: ClassPropType.bool, title: "Has catagory", name:"hasCatagory", description:"", default: false, template:false, variable:""} as IBoolClassProp,
                {type: ClassPropType.bool, title: "Has variables", name:"hasVariables", description:"", default: false, template:false, variable:""} as IBoolClassProp,
                {type: ClassPropType.bool, title: "Has triggers", name:"hasTriggers", description:"", default: false, template:false, variable:""} as IBoolClassProp,
                {type: ClassPropType.bool, title: "Has depends", name:"hasDepends", description:"", default: false, template:false, variable:""} as IBoolClassProp,
                {type: ClassPropType.bool, title: "Has sudo on", name:"hasSudoOn", description:"", default: false, template:false, variable:""} as IBoolClassProp,
                {type: ClassPropType.bool, title: "Has contains", name:"hasContains", description:"", default: false, template:false, variable:""} as IBoolClassProp,
                {type: ClassPropType.text, title: "Contains name", name:"contairsName", description:"", default: "Has", template:false, variable:""} as ITextClassProp,
                {type: ClassPropType.classContent, name:"content"} as IClassContentClassProp,  
                {type: ClassPropType.document, title: "Script", name:"script", description:"", lang: "Python", langName: "", template:false} as IDocumentClassProp
            ]
        }}/>;
}