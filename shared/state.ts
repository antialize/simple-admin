export enum PAGE_TYPE { Dashbord, ObjectList, Object, Deployment }

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

export interface ICollectionContent {
    contains?: number[];
    variables?: { key: string, value: string }[];
}

export interface IPackageContent { }

export interface IRootContent {
    variables?: { key: string, value: string }[];
}

export interface IHostContent extends ICollectionContent {
    password: string;
    messageOnDown: boolean;
    importantServices: string[];
    contains?: number[];
}

export interface IUserContent extends ICollectionContent {
    firstName: string;
    lastName: string;
    system: boolean;
    sudo: boolean;
    password: string;
    email: string;
    groups: string;
    depends?: number[];
    sudoOn?: number[];
}

export interface IGroupContent {
    system: boolean;
}

export interface IFileContent {
    path: string;
    user: string;
    group: string;
    mode: string;
    data: string;
    lang: string;
}

export type IContent = IHostContent | IUserContent | IGroupContent | IFileContent | ICollectionContent | IRootContent | IPackageContent;

export interface IObject {
    class: string;
    name: string;
    version: number;
    content: IContent;
}

export enum DEPLOYMENT_STATUS {Done, BuildingTree, InvilidTree, ComputingChanges, ReviewChanges, Deploying}

export enum DEPLOYMENT_OBJECT_STATUS {Normal, Deplying, Success, Failure}

export interface IDeploymentObject {
    id: number;
    host: string;
    cls: string;
    name: string;
    enabled: boolean;
    status: DEPLOYMENT_STATUS;
}