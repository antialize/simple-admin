import { Button } from "@mui/material";
import { observer } from "mobx-react";
import Message from "./Message";
import { HOST_ID, type IClientAction } from "./shared_types";
import state from "./state";

const MessageGroup = observer(function MessageGroup({
    ids,
    end,
    dismissed,
}: {
    ids: number[];
    start: number;
    end: number;
    dismissed: number;
}) {
    const toggle = (dismissed: boolean) => {
        const p: IClientAction = {
            type: "SetMessageDismissed",
            ids,
            dismissed,
            source: "webclient",
        };
        state.sendMessage(p);
    };

    const id = ids[0];
    const message = state.messages.get(id);
    if (!message) return null;
    const hosts = state.objectDigests.get(HOST_ID);
    const host = message.host && hosts?.get(message.host);
    // biome-ignore lint: host can be 0
    const hostname = (host && host.name) ?? "";
    const expanded = state.messageGroupExpanded.get(id) ?? false;

    const newDate = new Date(end * 1000);
    const actions = [];
    let c: string | undefined = undefined;
    if (dismissed !== 0) {
        actions.push(
            <Button
                color="primary"
                variant="contained"
                key="undismiss"
                onClick={() => {
                    toggle(false);
                }}
            >
                Undismiss all
            </Button>,
        );
        c = "message_good";
    }
    if (dismissed !== ids.length) {
        actions.push(
            <Button
                color="primary"
                variant="contained"
                key="dismiss"
                onClick={() => {
                    toggle(true);
                }}
            >
                Dismiss all
            </Button>,
        );
        c = "message_bad";
    }
    if (expanded)
        actions.push(
            <Button
                color="primary"
                variant="contained"
                key="contract"
                onClick={() => state.messageGroupExpanded.set(id, false)}
            >
                Contract
            </Button>,
        );
    else
        actions.push(
            <Button
                color="primary"
                variant="contained"
                key="expand"
                onClick={() => state.messageGroupExpanded.set(id, true)}
            >
                Expand
            </Button>,
        );

    const rows = [
        <tr className={c} key={`${ids[0]}_root`}>
            <td>
                {message.type} ({ids.length})
            </td>
            <td>{hostname}</td>
            <td />
            <td>{newDate.toUTCString()}</td>
            <td>{actions}</td>
        </tr>,
    ];
    if (expanded) {
        for (const id of ids) {
            rows.push(<Message key={id} inGroup={true} id={id} />);
        }
    }
    return <>{rows}</>;
});

export default MessageGroup;
