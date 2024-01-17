import {type IAction, type ACTION} from "./shared/actions";
import getOrInsert from "./shared/getOrInsert";

type ActionTarget = (action: IAction) => boolean;

export class ActionTargets {
    targets = new Map<ACTION, Set<ActionTarget>>();
    add(action: ACTION, target: ActionTarget): void {
        getOrInsert(this.targets, action, () => new Set()).add(target);
    }

    remove(action: ACTION, target: ActionTarget): void {
        const p = this.targets.get(action);
        if (p != null) {
            p.delete(target);
        }
    }
}
