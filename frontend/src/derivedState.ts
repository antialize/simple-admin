import { IObject2 } from "./shared/state";
import { IType, hostId, typeId } from "./shared/type";
import { computed } from "mobx";
import { state } from "./state";
import nullCheck from './shared/nullCheck';

class DerivedState {
    @computed
    get menuTypes() {
        const ans: {
            id: number;
            name: string;
        }[] = [];
        for (const [_, type] of state.types) {
            if (type.content.kind == "trigger")
                continue;
            ans.push({ id: type.id, name: nullCheck(type.content.plural) });
        }
        ans.sort((l, r) => {
            if (l.id == hostId)
                return -1;
            if (r.id == hostId)
                return 1;
            if (l.id == typeId)
                return 1;
            if (r.id == typeId)
                return -1;
            return l.name < r.name ? -1 : 1;
        });
        return ans;
    }
    @computed
    get triggers() {
        let triggers: IObject2<IType>[] = [];
        for (const [_, type] of state.types) {
            if (type.content.kind != "trigger")
                continue;
            triggers.push(type);
        }
        triggers.sort((l, r) => {
            return l.name < r.name ? -1 : 1;
        });
        return triggers;
    }
};

const derivedState = new DerivedState;
export default derivedState;
