export enum PAGE_TYPE { Dashbord, ObjectList, Object, Deployment }

export enum TRIGGER_TYPE {None, RestartService, ReloadService}

export interface INameIdPair {
    name: string;
    id: number;
}
export interface IObjectListPage {
    type: PAGE_TYPE.ObjectList;
    class: string;
}

export interface IObjectPage {
    type: PAGE_TYPE.Object;
    class: string;
    id?: number;
    version?: number;
};

export interface IDashbordPage {
    type: PAGE_TYPE.Dashbord;
}

export interface IDeploymentPage {
    type: PAGE_TYPE.Deployment;
}
export type IPage = IObjectListPage | IObjectPage | IDashbordPage | IDeploymentPage;

export interface IContainsContent {
    contains?: number[];
}

export interface IVariablesContent {
    variables?: { key: string, value: string }[];
}

export interface IDependsContent {
    depends?: number[];
}

export interface ICollectionContent extends IContainsContent, IVariablesContent { }

export interface IPackageContent {
    name?: string;
}

export interface IRootContent extends IVariablesContent { }


export interface IHostContent extends ICollectionContent {
    password: string;
    messageOnDown: boolean;
    importantServices: string[];
}

export interface IUserContent extends ICollectionContent, IDependsContent {
    firstName: string;
    lastName: string;
    system: boolean;
    sudo: boolean;
    admin?: boolean;
    password: string;
    email: string;
    shell?: string;
    groups: string;
    sudoOn?: number[];
    name?: string;
}

export interface IGroupContent {
    system: boolean;
    name?: string;
}

export interface IFileContent {
    path: string;
    user: string;
    group: string;
    mode: string;
    data: string;
    lang: string;
    triggers: {type:TRIGGER_TYPE, value:string}[];
}

export type IContent = IHostContent | IUserContent | IGroupContent | IFileContent | ICollectionContent | IRootContent | IPackageContent;

export interface IObject {
    class: string;
    name: string;
    version: number;
    content: IContent;
}

export enum DEPLOYMENT_STATUS { Done, BuildingTree, InvilidTree, ComputingChanges, ReviewChanges, Deploying }

export enum DEPLOYMENT_OBJECT_STATUS { Normal, Deplying, Success, Failure }
export enum DEPLOYMENT_OBJECT_ACTION { Add, Modify, Remove }

export interface IDeploymentObject {
    index: number;
    host: string;
    cls: string;
    name: string;
    enabled: boolean;
    status: DEPLOYMENT_OBJECT_STATUS;
    action: DEPLOYMENT_OBJECT_ACTION;
}

