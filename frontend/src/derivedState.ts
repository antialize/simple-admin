import { computed } from "mobx";
import nullCheck from "./nullCheck";
import { HOST_ID, type IObject2, type IType, TYPE_ID } from "./shared_types";
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
            if (l.id === HOST_ID) return -1;
            if (r.id === HOST_ID) return 1;
            if (l.id === TYPE_ID) return 1;
            if (r.id === TYPE_ID) return -1;
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
