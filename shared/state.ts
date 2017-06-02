export enum PAGE_TYPE { Dashbord, ObjectList, Object, Deployment }

export enum TRIGGER_TYPE {None, RestartService, ReloadService, EnableUfw}

export interface IObjectDigest {
    name: string;
    id: number;
    type: number;
    catagory: string;
}
export interface IObjectListPage {
    type: PAGE_TYPE.ObjectList;
    objectType: number;
}

export interface IObjectPage {
    type: PAGE_TYPE.Object;
    objectType: number;
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

export interface IObject2<T> {
    id: number;
    type: number;
    name: string;
    catagory: string;
    content: T;
    version: number;
}

export enum DEPLOYMENT_STATUS { Done, BuildingTree, InvilidTree, ComputingChanges, ReviewChanges, Deploying }

export enum DEPLOYMENT_OBJECT_STATUS { Normal, Deplying, Success, Failure }
export enum DEPLOYMENT_OBJECT_ACTION { Add, Modify, Remove, Trigger }

export interface IDeploymentObject {
    index: number;
    host: string;
    cls: string;
    name: string;
    enabled: boolean;
    status: DEPLOYMENT_OBJECT_STATUS;
    action: DEPLOYMENT_OBJECT_ACTION;
}

