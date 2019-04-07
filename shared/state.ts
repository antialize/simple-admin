import {IType} from './type'

export enum PAGE_TYPE { Dashbord, ObjectList, Object, Deployment, DeploymentDetails }

export interface IObjectDigest {
    name: string;
    id: number;
    type: number;
    category: string;
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

export interface IDeploymentDetailsPage {
    type: PAGE_TYPE.DeploymentDetails;
    index: number;
}

export type IPage = IObjectListPage | IObjectPage | IDashbordPage | IDeploymentPage | IDeploymentDetailsPage;

export interface IObject2<T> {
    id: number;
    type: number;
    name: string;
    category: string;
    content: T;
    version: number;
    comment: string;
}

export enum DEPLOYMENT_STATUS { Done, BuildingTree, InvilidTree, ComputingChanges, ReviewChanges, Deploying }

export enum DEPLOYMENT_OBJECT_STATUS { Normal, Deplying, Success, Failure }
export enum DEPLOYMENT_OBJECT_ACTION { Add, Modify, Remove, Trigger, Monitor }


export interface IDeploymentTrigger {
    typeId: number,
    script: string,
    content: {[key:string]:any},
    title: string,
}

export interface IDeploymentObject {
    index: number;
    host: number;
    hostName: string;
    title: string;
    name: string;
    enabled: boolean;
    status: DEPLOYMENT_OBJECT_STATUS;
    action: DEPLOYMENT_OBJECT_ACTION;

    script: string;
    prevScript: string;
    nextContent: {[key:string]: any};
    prevContent: {[key:string]: any};
    id: number;
    typeId: number;
    typeName: string;
    triggers: IDeploymentTrigger[];
    deploymentOrder: number;
}

