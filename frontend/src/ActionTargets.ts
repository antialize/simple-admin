import { IAction, ACTION } from "./shared/actions";
import getOrInsert from './shared/getOrInsert';

export interface ActionTarget {
    handle: (action: IAction) => boolean;
}

export class ActionTargets {
    targets: Map<ACTION, Set<ActionTarget>> = new Map;
    add(action: ACTION, target: ActionTarget) {
        getOrInsert(this.targets, action, ()=>new Set()).add(target);
    }
    remove(action: ACTION, target: ActionTarget) {
        const p = this.targets.get(action);
        p && p.delete(target);
    }
}

