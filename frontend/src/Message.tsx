import { Button } from "@mui/material";
import { observer } from "mobx-react";
import { ACTION, type IMessageTextReqAction, type ISetMessagesDismissed } from "./shared/actions";
import nullCheck from "./shared/nullCheck";
import { hostId } from "./shared/type";
import state from "./state";

const Message = observer(function Message({ id, inGroup }: { id: number; inGroup: boolean }) {
    const message = nullCheck(state.messages.get(id));
    const hostObject = nullCheck(state.objectDigests.get(hostId)).get(nullCheck(message.host));
    const hostname = hostObject ? hostObject.name : "";
    const newDate = new Date(message.time * 1000);

    const setDismissed = (dismissed: boolean) => {
        const p: ISetMessagesDismissed = {
            type: ACTION.SetMessagesDismissed,
            ids: [id],
            dismissed,
            source: "webclient",
        };
        state.sendMessage(p);
    };

    const setExpanded = (expanded: boolean, fetch: boolean) => {
        if (fetch) {
            const p: IMessageTextReqAction = {
                type: ACTION.MessageTextReq,
                id,
            };
            state.sendMessage(p);
        }
        state.messageExpanded.set(id, expanded);
    };

    const actions = [];
    let c;

    if (message.dismissed) {
        actions.push(
            <Button
                key="undismiss"
                color="primary"
                variant="contained"
                onClick={() => {
                    setDismissed(false);
                }}
            >
                Undismiss
            </Button>,
        );
        c = "message_good";
    } else {
        actions.push(
            <Button
                key="dismiss"
                color="primary"
                variant="contained"
                onClick={() => {
                    setDismissed(true);
                }}
            >
                Dismiss
            </Button>,
        );
        c = "message_bad";
    }

    let msg = message.message;
    if (msg && msg.length > 999) {
        if (!state.messageExpanded.get(id)) {
            msg = msg.substr(0, 999) + "...";
            actions.push(
                <Button
                    key="expand"
                    color="primary"
                    variant="contained"
                    onClick={() => {
                        setExpanded(true, !message.fullMessage);
                    }}
                >
                    Full text
                </Button>,
            );
        } else {
            actions.push(
                <Button
                    key="contract"
                    color="primary"
                    variant="contained"
                    onClick={() => {
                        setExpanded(false, false);
                    }}
                >
                    Partial text
                </Button>,
            );
        }
    }
    return (
        <tr className={c} key={id}>
            {inGroup ? <td colSpan={2} /> : <td>{message.type}</td>}
            {inGroup ? null : <td>{hostname}</td>}
            <td>{msg}</td>
            <td>{newDate.toUTCString()}</td>
            <td>{actions}</td>
        </tr>
    );
});

export default Message;
