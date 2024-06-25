export enum TypePropType {
    none = 0,
    bool = 1,
    text = 2,
    password = 3,
    document = 4,
    choice = 5,
    typeContent = 6,
    number = 7,
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

export interface INoneTypeProp {
    type: TypePropType.none;
}

export type ITypeProp =
    | IBoolTypeProp
    | ITextTypeProp
    | INumberTypeProp
    | IPasswordTypeProp
    | IDocumentTypeProp
    | IChoiceTypeProp
    | ITypeContentTypeProp
    | INoneTypeProp;

export type KindType =
    | "host"
    | "root"
    | "collection"
    | "delta"
    | "sum"
    | "type"
    | "trigger"
    | "hostvar";

export interface IType {
    plural?: string;
    kind?: KindType;
    deployOrder?: number;
    script?: string;
    hasCategory?: boolean;
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
    variables: Array<{ key: string; value: string }>;
}

export interface IContains {
    contains: number[];
}

export interface ISudoOn {
    sudoOn: number[];
}

export interface ITrigger {
    id: number;
    values: Record<string, any>;
}

export interface ITriggers {
    triggers: ITrigger[];
}

export interface IDepends {
    depends: number[];
}

export interface Host extends IVariables, IContains {
    messageOnDown?: boolean;
    debPackages?: boolean;
    usePodman?: boolean;
}

export const typeId = 1;
export const hostId = 2;
export const rootId = 3;
export const userId = 4;
export const packageId = 10;
export const rootInstanceId = 100;
