import { CircularProgress } from "@mui/material";
import type { Remote } from "./Remote";

interface ExtractRemoteGood<T> {
    state: "good";
    data: T;
}
interface ExtractRemoteBad {
    state: "bad";
    error: React.ReactElement;
}
type ExtractRemote<T> = ExtractRemoteGood<T> | ExtractRemoteBad;

function extractRemote<T, E>(r: Remote<T, E> | null | undefined): ExtractRemote<T> {
    if (r == null) return { state: "bad", error: <span>Internal error: undefined remote</span> };
    switch (r.state) {
        case "initial":
            return { state: "bad", error: <span>Internal error: Remote in initial state</span> };
        case "loading":
            return { state: "bad", error: <CircularProgress /> };
        case "error":
            return { state: "bad", error: <span>Error loading remote content</span> };
        case "data":
            return { state: "good", data: r.data };
    }
}

export default extractRemote;
