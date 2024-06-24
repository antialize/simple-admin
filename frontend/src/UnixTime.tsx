import * as React from "react";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
class UnixTime extends React.Component<{ time: number }, { delta: number }> {
    timer: any | null = null;

    constructor(props: { time: number }) {
        super(props);
        this.state = { delta: +new Date() / 1000 - this.props.time };
    }

    scheduleTimer() {
        let wait: number | null = null;
        if (this.state.delta < 60) {
            wait = 100;
        } else if (this.state.delta < 60 * 60) {
            wait = 1000;
        } else if (this.state.delta < 60 * 60 * 24) {
            wait = 1000 * 60;
        } else if (this.state.delta < 60 * 60 * 75) {
            wait = 1000 * 60 * 60;
        }
        if (wait)
            this.timer = setTimeout(() => {
                this.setState({ delta: +new Date() / 1000 - this.props.time });
                this.scheduleTimer();
            }, wait);
    }

    componentDidMount() {
        this.scheduleTimer();
    }

    componentWillUnmount() {
        if (this.timer !== null) clearTimeout(this.timer);
    }

    render() {
        const delta = this.state.delta;
        const time = this.props.time;
        const d = new Date(time * 1000);
        const title = d.toString();

        if (delta < 60 * 60 * 72) {
            let de = delta;
            const y = Math.trunc(de / (60 * 60 * 24 * 356.25));
            de -= y * 60 * 60 * 24 * 356.25;
            const d = Math.trunc(de / (60 * 60 * 24));
            de -= d * 60 * 60 * 24;
            const h = Math.trunc(de / (60 * 60));
            de -= h * 60 * 60;
            const m = Math.trunc(de / 60);
            const s = (de - m * 60).toFixed(0);
            if (y != 0)
                return (
                    <span title={title}>
                        {y}y {d}d ago
                    </span>
                );
            if (d != 0)
                return (
                    <span title={title}>
                        {d}d {h}h ago
                    </span>
                );
            if (h != 0)
                return (
                    <span title={title}>
                        {h}h {m}m ago
                    </span>
                );
            if (m != 0)
                return (
                    <span title={title}>
                        {m}m {s}s ago
                    </span>
                );
            return <span title={title}>{Math.round(delta * 1000)}ms ago</span>;
        }

        const now = new Date();
        if (now.getFullYear() != d.getFullYear()) {
            return (
                <span title={title}>
                    {months[d.getMonth()]} {d.getFullYear()}
                </span>
            );
        }
        return (
            <span title={title}>
                {months[d.getMonth()]} {d.getDate()}
            </span>
        );
    }
}

export default UnixTime;
