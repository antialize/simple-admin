import { Typography } from "@mui/material";
import { observer } from "mobx-react";
import Box from "./Box";
import Message from "./Message";
import MessageGroup from "./MessageGroup";
import nullCheck from "./shared/nullCheck";
import state from "./state";

interface MGroup {
    ids: number[];
    start: number;
    end: number;
    dismissed: number;
}

const Messages = observer(function Messages({ host }: { host?: number }) {
    const messages: Array<{ id: number; time: number }> = [];
    let count = 0;
    for (const [_, message] of state.messages) {
        if (host != null && message.host != host) continue;
        if (!message.dismissed) count++;
        messages.push({ id: message.id, time: message.time });
    }
    messages.sort((l, r) => {
        return r.time - l.time;
    });

    const messageGroups: MGroup[] = [];
    for (const m of messages) {
        const t = nullCheck(state.messages.get(m.id));
        if (messageGroups.length == 0) {
            messageGroups.push({
                ids: [m.id],
                start: m.time,
                end: m.time,
                dismissed: t.dismissed ? 1 : 0,
            });
            continue;
        }
        const g = messageGroups[messageGroups.length - 1];
        const o = nullCheck(state.messages.get(g.ids[0]));
        if (o.host != t.host || o.type != t.type || o.subtype != t.subtype) {
            messageGroups.push({
                ids: [m.id],
                start: m.time,
                end: m.time,
                dismissed: t.dismissed ? 1 : 0,
            });
        } else {
            g.end = m.time;
            if (t.dismissed) g.dismissed += 1;
            g.ids.push(m.id);
        }
    }

    let title;
    if (count == 0) title = <span style={{ color: "#070" }}>Messages</span>;
    else title = <span style={{ color: "#700" }}>Messages ({count})</span>;
    const messageItems = [];
    for (const group of messageGroups) {
        const id = group.ids[0];
        if (group.ids.length == 1) {
            messageItems.push(<Message id={id} key={id} inGroup={false} />);
        } else {
            messageItems.push(
                <MessageGroup
                    key={id}
                    ids={group.ids}
                    start={group.start}
                    end={group.end}
                    dismissed={group.dismissed}
                />,
            );
        }
    }
    return (
        <Box title={title} expanded={count != 0} collapsable={true}>
            <table className="message_table">
                <thead>
                    <tr>
                        <th>
                            <Typography variant="body1" component="span">
                                Type
                            </Typography>
                        </th>
                        <th>
                            <Typography variant="body1" component="span">
                                Host
                            </Typography>
                        </th>
                        <th>
                            <Typography variant="body1" component="span">
                                Message
                            </Typography>
                        </th>
                        <th>
                            <Typography variant="body1" component="span">
                                Time
                            </Typography>
                        </th>
                        <th>
                            <Typography variant="body1" component="span">
                                Action
                            </Typography>
                        </th>
                    </tr>
                </thead>
                <tbody>{messageItems}</tbody>
            </table>
        </Box>
    );
});

export default Messages;
