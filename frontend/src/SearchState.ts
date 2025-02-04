import { action, makeObservable, observable } from "mobx";
import type { ISearchRes, ISearchResObject } from "./shared_types";
import state from "./state";

export default class SearchState {
    constructor() {
        makeObservable(this);
    }

    @observable
    key = "";

    @observable
    searchKey = "";

    @observable.shallow
    objects: Array<ISearchResObject> = [];

    @observable
    searching = false;

    @observable
    content: number | null = null;

    @action
    search() {
        this.objects = [];
        this.searchKey = this.key;
        this.searching = true;
        if (this.key) {
            state.sendMessage({
                type: "Search",
                ref: 0,
                pattern: `%${this.key.replace(" ", "%")}%`,
            });
        }
    }

    @action
    handleSearch(res: ISearchRes) {
        this.searching = false;
        this.objects = res.objects;
    }
}
