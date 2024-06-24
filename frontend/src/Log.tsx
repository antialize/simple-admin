import state from "./state";
import { type IAction, ACTION, type IStartLog, type IEndLog } from "./shared/actions";
import nullCheck from "./shared/nullCheck";
import { type MutableRefObject, useEffect, useRef } from "react";
import { Typography } from "@mui/material";

let idc = 0;

/*
 * Display a log for a given host.
 *
 * The log is maintaied by the component outside of redux, and even outside of react. For performance,
 * new lines are simply added to the end of an ul.
 */
export default function Log(props: {
    type: "dmesg" | "file" | "journal";
    unit?: string;
    host: number;
}) {
    const ul: MutableRefObject<HTMLUListElement | null> = useRef(null);

    useEffect(() => {
        if (ul.current == null) return;
        const ulv = ul.current;

        const id = idc++;
        const handle = (action: IAction) => {
            if (action.type != ACTION.AddLogLines) return false;
            if (action.id != id) return false;

            for (const line of action.lines) {
                const li = document.createElement("li");
                li.textContent = line;
                ulv.appendChild(li);
            }
            ulv.scrollTop = ulv.scrollHeight;
            return true;
        };

        const msg: IStartLog = {
            type: ACTION.StartLog,
            host: props.host,
            logtype: props.type,
            unit: props.unit,
            id,
        };
        state.sendMessage(msg);
        nullCheck(state.actionTargets).add(ACTION.AddLogLines, handle);

        return () => {
            const msg: IEndLog = {
                type: ACTION.EndLog,
                id,
                host: props.host,
            };
            state.sendMessage(msg);
            nullCheck(state.actionTargets).remove(ACTION.AddLogLines, handle);
        };
    }, []);
    return (
        <Typography>
            <ul
                ref={ul}
                style={{
                    margin: 0,
                    listStyleType: "none",
                    overflowY: "scroll",
                    overflowX: "auto",
                    maxHeight: "500px",
                    padding: 0,
                }}
            />
        </Typography>
    );
}
