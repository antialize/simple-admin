import getOrInsert from "./getOrInsert";
import type { IServerAction } from "./shared_types";

type ActionTarget = (action: IServerAction) => boolean;

export class ActionTargets {
    targets = new Map<string, Set<ActionTarget>>();
    add(action: string, target: ActionTarget): void {
        getOrInsert(this.targets, action, () => new Set()).add(target);
    }

    remove(action: string, target: ActionTarget): void {
        const p = this.targets.get(action);
        if (p != null) {
            p.delete(target);
        }
    }
}
