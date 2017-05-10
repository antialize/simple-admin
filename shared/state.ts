export enum PAGE_TYPE {Dashbord, ObjectList, Object}

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
    version ?: number;
};

export interface IDashbordPage {
    type: PAGE_TYPE.Dashbord;
}

export type IPage = IObjectListPage | IObjectPage | IDashbordPage;

export interface IHostContent {
    password: string;
    messageOnDown: boolean;
    importantServices: string[];
}

export interface IUserContent {
    firstName: string;
    lastName: string;
    system: boolean;
    sudo: boolean;
    password: string;
    email: string;
    groups: string;
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

export type IContent = IHostContent | IUserContent | IGroupContent | IFileContent;

export interface IObject {
    class: string;
    name: string;
    version: number;
    content: IContent;
}
