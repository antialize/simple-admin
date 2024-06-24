import { computed } from "mobx";
import nullCheck from "./shared/nullCheck";
import type { IObject2 } from "./shared/state";
import { type IType, hostId, typeId } from "./shared/type";
import { state } from "./state";

class DerivedState {
    @computed
    get menuTypes(): Array<{ id: number; name: string }> {
        const ans: Array<{
            id: number;
            name: string;
        }> = [];
        for (const [_, type] of state.types) {
            if (type.content.kind === "trigger") continue;
            ans.push({ id: type.id, name: nullCheck(type.content.plural) });
        }
        ans.sort((l, r) => {
            if (l.id === hostId) return -1;
            if (r.id === hostId) return 1;
            if (l.id === typeId) return 1;
            if (r.id === typeId) return -1;
            return l.name < r.name ? -1 : 1;
        });
        return ans;
    }

    @computed
    get triggers(): Array<IObject2<IType>> {
        const triggers: Array<IObject2<IType>> = [];
        for (const [_, type] of state.types) {
            if (type.content.kind !== "trigger") continue;
            triggers.push(type);
        }
        triggers.sort((l, r) => {
            return l.name < r.name ? -1 : 1;
        });
        return triggers;
    }
}

const derivedState = new DerivedState();
export default derivedState;
