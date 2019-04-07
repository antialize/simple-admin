import { IAction, ACTION } from "../../shared/actions";

export interface ActionTarget {
    handle: (action: IAction) => boolean;
}

export class ActionTargets {
    targets: Map<ACTION, Set<ActionTarget>> = new Map;
    add(action: ACTION, target: ActionTarget) {
        if (!this.targets.has(action))
            this.targets.set(action, new Set);
        this.targets.get(action).add(target);
    }
    remove(action: ACTION, target: ActionTarget) {
        this.targets.get(action).delete(target);
    }
}

