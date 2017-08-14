export enum TypePropType {
    none, bool, text, password, document, choice, typeContent, number, monitorContent
}

export interface IBoolTypeProp {
    type: TypePropType.bool;
    title: string;
    name: string;
    description: string;
    default: boolean;
    variable: string;
}

export interface ITextTypeProp {
    type: TypePropType.text;
    title: string;
    name: string;
    description: string;
    default: string;
    template: boolean;
    variable: string;
    deployTitle?: boolean;
    lines?: number;
}

export interface IPasswordTypeProp {
    type: TypePropType.password;
    title: string;
    name: string;
    description: string;
}

export interface IDocumentTypeProp {
    type: TypePropType.document;
    title: string;
    name: string;
    langName: string;
    lang: string;
    description: string;
    template: boolean;
    variable: string;
}

export interface IChoiceTypeProp {
    type: TypePropType.choice;
    title: string;
    name: string;
    description: string;
    default: string;
    choices: string[];
    variable: string;
}

export interface INumberTypeProp {
    type: TypePropType.number;
    title: string;
    name: string;
    description: string;
    default: number;
}

export interface ITypeContentTypeProp {
    type: TypePropType.typeContent;
    name: string;
}

export interface IMonitorContentTypeProp {
    type: TypePropType.monitorContent;
    name: string;
}

export interface INoneTypeProp {
    type: TypePropType.none;
}

export type ITypeProp = IBoolTypeProp | ITextTypeProp | INumberTypeProp | IPasswordTypeProp | IDocumentTypeProp | IChoiceTypeProp | ITypeContentTypeProp | INoneTypeProp | IMonitorContentTypeProp;

export type KindType = "host" | "root" | "collection" | "delta" | "sum" | "type" | "trigger"

export interface IType {
    plural?: string;
    kind?: KindType;
    deployOrder?: number;
    script?: string;
    hasCatagory?: boolean;
    hasVariables?: boolean;
    hasContains?: boolean;
    hasSudoOn?: boolean;
    hasTriggers?: boolean;
    hasDepends?: boolean;
    containsName?: string;
    content?: ITypeProp[];
    nameVariable?: string;
}

export interface IVariables {
    variables: {key:string, value:string}[];
}

export interface IContains {
    contains: number[];
}

export interface ISudoOn {
    contains: number[];
}

export interface ITrigger {
    id:number, values: {[key:string]: any};
}

export interface ITriggers {
    triggers:ITrigger[];
}

export interface IDepends {
    depends: number[];
}

export type Host = IVariables & IContains;

export const typeId = 1;
export const hostId = 2;
export const rootId = 3;
export const monitorId = 11;
export const rootInstanceId = 100;

