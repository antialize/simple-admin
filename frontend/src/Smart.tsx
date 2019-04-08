import * as React from "react";
import state from "./state";
import { observer } from "mobx-react";

const Smart = observer(function Smart({host}:{host:number}) {
    let rows: JSX.Element[] = [];
    const importantSmart = new Set([5,103,171,172,175,176,181,182,184,187,188,191,197,198,200,221]);
    const smart = state.status.get(host).smart;
    for (const [dev, values] of smart) {
        rows.push(<tr className="smart_device"><td colSpan={3}>{dev}</td></tr>);
        for (const status of values) {
            let className=importantSmart.has(status.id)?(status.raw_value == 0?"smart_good":"smart_bad"):"smart_normal";
            rows.push(<tr className={className}><td>{status.id}</td><td>{status.name}</td><td>{status.raw_value}</td></tr>)
        }
    }
    return (
        <div>
            <table className="smart_table">
                <thead>
                    <tr>
                        <th>Id</th><th>Name</th><th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>)
});

export default Smart;
