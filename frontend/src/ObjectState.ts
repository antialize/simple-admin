import { IDeleteObject, ACTION, IDeployObject, ISaveObject, IFetchObject } from "../../shared/actions";
import { IObject2, PAGE_TYPE } from "../../shared/state";
import { IType, TypePropType } from "../../shared/type";
import { observable, action } from "mobx";
import { state } from "./state";
import nullCheck from "../../shared/nullCheck";

class ObjectState {
    @observable
    current: IObject2<any> | null;
    @observable
    versions: Map<number, IObject2<any>>;
    @observable
    touched: boolean;
    loadStatus: "not_loaded" | "loading" | "loaded";
    constructor(public id: number) {
        this.current = null;
        this.versions = new Map;
        this.touched = false;
        this.loadStatus = "not_loaded";
    }
    @action.bound
    save() {
        const a: ISaveObject = {
            type: ACTION.SaveObject,
            id: this.id,
            obj: this.current
        };
        state.sendMessage(a);
        this.touched = true;
    }
    @action.bound
    discard() {
        this.current = null;
        this.touched = false;
        this.loadCurrent();
    }
    @action.bound
    deploy(cancel: boolean, redeploy: boolean) {
        nullCheck(state.page).set({ type: PAGE_TYPE.Deployment });
        if (cancel)
            nullCheck(state.deployment).cancel();
        const a: IDeployObject = {
            type: ACTION.DeployObject,
            id: this.id,
            redeploy
        };
        state.sendMessage(a);
    }
    @action.bound
    delete() {
        const a: IDeleteObject = {
            type: ACTION.DeleteObject,
            id: this.id
        };
        state.sendMessage(a);
    }
    @action.bound
    fillDefaults(type: IType) {
        if (!this.current) return;

        let content = this.current.content;
        if (type.hasVariables && !('variables' in content))
            content['variables'] = [];
        if (type.hasContains && !('contains' in content))
            content['contains'] = [];
        if (type.hasSudoOn && !('sudoOn' in content))
            content['sudoOn'] = [];
        if (type.hasSudoOn && !('triggers' in content))
            content['triggers'] = [];
        if (type.hasDepends && !('depends' in content))
            content['depends'] = [];
        for (const item of type.content || []) {
            switch (item.type) {
                case TypePropType.bool:
                case TypePropType.choice:
                case TypePropType.text:
                    if (!(item.name in content))
                        content[item.name] = item.default;
                    break;
                case TypePropType.document:
                    if (item.langName && !(item.langName in content))
                        content[item.langName] = "";
                    if (!(item.name in content))
                        content[item.name] = "";
                    break;
                case TypePropType.password:
                    if (!(item.name in content))
                        content[item.name] = Array.from((window as any).crypto.getRandomValues(new Uint8Array(18)), (byte: number) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
                    break;
                case TypePropType.none:
                    break;
                case TypePropType.typeContent:
                    if (!(item.name in content))
                        content[item.name] = [];
            }
        }
    }
    @action.bound
    loadCurrent() {
        const cp = nullCheck(state.page).current;
        if (cp.type != PAGE_TYPE.Object)
            return;
        if (this.loadStatus == "loading")
            return;
        if (this.id >= 0) {
            if (this.loadStatus == "not_loaded") {
                let a: IFetchObject = {
                    type: ACTION.FetchObject,
                    id: this.id
                };
                state.sendMessage(a);
                this.loadStatus = "loading";
                return;
            }
            if (cp.version == null) {
                // We have no version so lets pick the newest
                cp.version = 1;
                for (let [v, e] of this.versions)
                    cp.version = Math.max(cp.version, v);
            }
            if (this.current != null && this.current.version == cp.version)
                return; //We are allready modifying the right object
            this.current = JSON.parse(JSON.stringify(this.versions.get(cp.version)));
        }
        else { // We are modifying a new object
            if (this.current != null)
                return; //We are allready modifying the right object
            this.current = { id: this.id, type: cp.objectType, name: "", version: null, category: "", content: {}, comment: "" };
        }
        this.fillDefaults(state.types.get(cp.objectType).content);
    }
}

export default ObjectState;
