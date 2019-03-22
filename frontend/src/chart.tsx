import * as React from "react";
import { IStatBucket, ACTION, IRequestStatBucket, ISubscribeStatValues, IStatValueChanges} from '../../shared/actions'
import { MyDate } from './MyDate'
import { observer } from "mobx-react";
import state from "./state";
import { withTheme } from "@material-ui/core/styles";
import { ThemedComponentProps } from "@material-ui/core/styles/withTheme";

const charts: {[key:number]: ChartImpl} = {};
const epoc = 1514764800;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
    style?: React.CSSProperties;
    initialZoom: number;
    host: number;
}

const preScale = 2;

@observer
class ChartImpl extends React.Component<Props &  ThemedComponentProps, {}> {
    static cntr = 0;
    target: number;
    canvas: HTMLCanvasElement;
    zoom: number;
    host: number;
    delayedRender : number;
    values: string[] = ["common.cpu", "common.count", "common.diskread", "common.diskwrite", "common.netread", "common.netwrite" ];
    endTime: number;
    buckets: {[name:string]: {[level:number]: {[index:number]: number[]|null}}} = {};
    snapInterval: number = null;
    leftSpace: number = null;
    rightSpace: number = null;

    constructor(props: Props & ThemedComponentProps) {
        super(props);
        this.target = ChartImpl.cntr;
        this.host = props.host;
        this.zoom = props.initialZoom;
        ++ChartImpl.cntr;
        charts[this.target] = this;
        this.endTime = (+new Date() / 1000);
        this.setSnap(true);
    }

    setSnap(snap:boolean) {
        if (this.snapInterval) {
            window.clearInterval(this.snapInterval);
            this.snapInterval = null;
        }
        if (snap) {
            this.snapInterval = window.setInterval(()=> {
                this.endTime = (+new Date() / 1000);
                this.updateCanvas();
            }, 50*Math.pow(2, 20-this.zoom));
        }
    }

    requestData() {
        const startTime = this.endTime - this.canvas.clientWidth * preScale * Math.pow(2, 20-this.zoom);

        let start = ((startTime - epoc)/ 5) >> 10;
        let end = ((this.endTime - epoc)/5) >> 10;
        
        for (let level = 20; level >= 0; --level) {
            if (level <= this.zoom) {
                for (let index=start; index <= end; ++index)
                    for (let name of this.values) {
                        if (name in this.buckets && level in this.buckets[name] && index in this.buckets[name][level]) continue;
                        if (!(name in this.buckets)) this.buckets[name] = {};
                        if (!(level in this.buckets[name])) this.buckets[name][level] = {};
                        this.buckets[name][level][index] = null;
        
                        let a: IRequestStatBucket = {
                            type: ACTION.RequestStatBucket,
                            target: this.target,
                            host: this.host,
                            name,
                            level,
                            index
                        }
                        state.sendMessage(a);
                    }
            }
            start = start >> 1;
            end = end >> 1;
        }
    }

    componentDidMount() {
        this.requestData();
        let a: ISubscribeStatValues = {
            type: ACTION.SubscribeStatValues,
            target: this.target,
            host: this.host,
            values: this.values
        };
        state.sendMessage(a);
        this.updateCanvas();
    }
    componentDidUpdate() {
        this.requestData();
        this.updateCanvas();
    }

    componentWillUnmount() {
        delete charts[this.target];
        if (this.snapInterval) window.clearInterval(this.snapInterval);
        if (this.delayedRender) window.clearTimeout(this.delayedRender);
        let a: ISubscribeStatValues = {
            type: ACTION.SubscribeStatValues,
            target: this.target,
            host: this.host,
            values: null
        };
        state.sendMessage(a);
    }


    updateCanvas() {
        if (this.delayedRender) window.clearTimeout(this.delayedRender);
        this.delayedRender = null;
        if (!this.canvas) return;
        const w = this.canvas.clientWidth;;
        const h = this.canvas.clientHeight;
        this.canvas.setAttribute("width", ""+w);
        this.canvas.setAttribute("height", ""+h);
        const ctx = this.canvas.getContext('2d');

        ctx.clearRect(0, 0, w, h);
       
        const scale = Math.pow(2, 20-this.zoom) / preScale;
        let startTime = this.endTime - this.canvas.clientWidth * scale;
        let level = Math.min(Math.floor(this.zoom), 20);
        let start = ((startTime - epoc)/ 5) >> (10 + 20 - level);
        let end = ((this.endTime - epoc)/ 5) >> (10 + 20 - level);

        let bottomSpace = 28;
        let leftSpace = 0;
        let rightSpace = 0;
        let topSpace = 0;
        
        const getPoints = (names:string[], func: (...values:number[])=>number) => {
            let points: {time:number, value:number}[] = [];
            let maxValue = 0;
            for (const name of names) {
                if (!(name in this.buckets) || !(level in this.buckets[name])) return;
            }

            for (let index = start; index <= end; ++index) {
                let values = [];
                for (const name of names) {
                    if (index in this.buckets[name][level] && this.buckets[name][level][index]) 
                        values.push(this.buckets[name][level][index]);
                }
                if (values.length != names.length) continue;
    
                for (let i=0; i < 1024; ++i) {
                    let time = ((index << 10) + i) * (5 << (20-level)) + epoc;
                    let vs = [];
                    for (const v of values) vs.push(v[i]);
                    let value = func(...vs);
                    if (time >= startTime && time <= this.endTime && value && value > maxValue) maxValue = value;
                    points.push({time, value});
                }
            }
            return {maxValue, points};
        };

        const renderXAxes = () => {
            const contentWidth = w - leftSpace - rightSpace;
            let timeHeight = 28;
            let tpp = 100 * (this.endTime - startTime) / contentWidth;
            ctx.save();
            ctx.strokeStyle = this.props.theme.palette.text.primary;
            ctx.fillStyle =  this.props.theme.palette.text.primary;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(leftSpace-2, h - bottomSpace);
            ctx.lineTo(w-rightSpace+2, h - bottomSpace);
            ctx.stroke();
            ctx.font = '14px serif';

            let myDate = MyDate.fromUnix(startTime);
            let myEndDate = MyDate.fromUnix(this.endTime);
            myDate.setSeconds(0);

            if (tpp < 60*60*24) {
                let lastDate = myDate.date;
                let deltaM = 0;
                if (tpp < 60*2) deltaM = 1;
                else if (tpp < 60*5) deltaM = 2;
                else if (tpp < 60*10) deltaM = 5;
                else if (tpp < 60*15) deltaM = 10;
                else if (tpp < 60*20) deltaM = 15;
                else if (tpp < 60*30) deltaM = 20;
                else if (tpp < 60*60) deltaM = 30;
                else if (tpp < 60*60*2) deltaM = 60;
                else if (tpp < 60*60*4) deltaM = 60*2;
                else if (tpp < 60*60*6) deltaM = 60*4;
                else if (tpp < 60*60*12) deltaM = 60*6;
                else deltaM = 60*12;

                if (deltaM < 60) {
                    myDate.setMinutes(Math.floor(myDate.minutes / deltaM) * deltaM);
                } else {
                    myDate.setHours(Math.floor(myDate.hours / (deltaM / 60)) * (deltaM / 60));
                    myDate.setMinutes(0);
                }         
                
                while (true) {
                    myDate.setMinutes(myDate.minutes+deltaM);
                    if (myDate.comp(myEndDate) == 1) break;
                    const time = myDate.toUnix();
                    const x = leftSpace + (time - startTime)* contentWidth / (this.endTime - startTime);
                    ctx.beginPath();
                    ctx.moveTo(x, h - bottomSpace +2);
                    ctx.lineTo(x, h - bottomSpace -2);
                    ctx.stroke();
                    ctx.fillText(myDate.hours + ":" + (myDate.minutes < 10 ? "0"+ myDate.minutes: myDate.minutes), x, Math.round(h-bottomSpace/2)+0.5);
                    if (lastDate != myDate.date) {
                        ctx.fillText(monthNames[myDate.month] + " " + myDate.date + ", " + myDate.year, x, h-0.5);
                        lastDate = myDate.date;
                    }
                }
            } else {
                let lastYear = myDate.year;
                let deltaD = 0;
                let deltaM = 0;
                if (tpp < 60*60*24*2) deltaD = 1;
                else if (tpp < 60*60*24*4) deltaD = 2;
                else if (tpp < 60*60*24*8) deltaD = 4;         
                else if (tpp < 60*60*24*16) deltaD = 8;         
                else if (tpp < 60*60*24*32) deltaD = 16;
                else if (tpp < 60*60*24*32*2) deltaM = 1;
                else if (tpp < 60*60*24*32*3) deltaM = 2;
                else if (tpp < 60*60*24*32*4) deltaM = 3;
                else if (tpp < 60*60*24*32*6) deltaM = 6;
                myDate.setMinutes(0);
                myDate.setHours(0);
                if (deltaM != 0) {
                    myDate.setDate(0);
                    myDate.setMonth(Math.floor(myDate.month / deltaM) * deltaM);
                } else {
                    myDate.setDate(1+Math.floor((myDate.date - 1)/deltaD) * deltaD);
                }
                while (true) {
                    myDate.setDate(myDate.date+deltaD);
                    myDate.setMonth(myDate.month+deltaM);
                    if (myDate.comp(myEndDate) == 1) break;
                    const time = myDate.toUnix();
                    const x = leftSpace + Math.round((time - startTime)* contentWidth / (this.endTime - startTime));
                    ctx.beginPath();
                    ctx.moveTo(x, h - bottomSpace +2);
                    ctx.lineTo(x, h - bottomSpace -2);
                    ctx.stroke();
                    ctx.fillText(monthNames[myDate.month] + " " + myDate.date, x, Math.round(h-bottomSpace/2));
                    if (lastYear != myDate.year) {
                        ctx.fillText(""+myDate.year, x, h);
                        lastYear = myDate.year;
                    }   
                }
            } //TODO handle years here
            ctx.restore();
        };

    

        const renderPoints = (points: {time:number, value:number}[], maxValue:number,  color:string) => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(leftSpace,0,w-rightSpace-leftSpace,h);
            ctx.clip();
            ctx.strokeStyle = color;

            ctx.lineWidth = 2;
            ctx.beginPath();
            const contentWidth = w - leftSpace - rightSpace;
            const contentHeight = h - topSpace - bottomSpace;;

            points.push({time:null, value:null});

            let x1:number = null;
            let x2:number = null;
            let y1:number = null;
            let y1d:number = null;
            let y2:number = null;

            for (let {time, value} of points) {
                let x3 = null;
                let y3 = null;
                if (value != null) {
                    x3 = leftSpace + (time - startTime)* contentWidth / (this.endTime - startTime);
                    y3 = h - bottomSpace - (value / maxValue)*contentHeight;
                }

                if (y2 == null) {

                } else if (y1 == null) {
                    if (y3 != null) {
                        ctx.moveTo(x2, y2);
                        y1d = y2 * 0.666 + y3 *0.333;
                    } else {
                        //Perhaps we should draw a point
                    }
                } else if (y3 == null) {
                    ctx.bezierCurveTo(x1*0.666 + x2*0.333, y1d, x1*0.333 + x2*0.666, y1*0.333 + y2*0.666, x2, y2);
                    y1d = null;
                } else {
                    let slope = 0;
                    if ((y1 < y2) != (y2 < y3)) {
                        //We are not at a top or a bottom
                        slope = (y3 - y1)/(x3 - x1);                        
                    }
                    ctx.bezierCurveTo(x1*0.666 + x2*0.333, y1d, x1*0.333 + x2*0.666, y2 + slope * (x2-x1)*0.333, x2, y2);
                    y1d = y2 - slope * (x3-x2)*0.333;
                }
                x1 = x2;
                y1 = y2;
                x2 = x3;
                y2 = y3;
            }
            ctx.stroke();
            ctx.restore();
        };

        const renderAxisY = (maxValue: number, unit: "%" | "" | "bs", right: boolean = false) => {
            ctx.save();
            ctx.font = '14px serif';
            ctx.fillStyle = this.props.theme.palette.text.primary;
            ctx.strokeStyle = this.props.theme.palette.text.primary;

            const labels: {text:string, value:number}[] = [];
            let time = "";
            if (unit == "bs") {
                if (maxValue > 10)
                    time = "/s";
                else if (maxValue > 10/60) {
                    maxValue *= 60;
                    time = "/m";
                } else {
                    maxValue *= 60*60;
                    time = "/h";
                }
            }

            const contentHeight = h - topSpace - bottomSpace;
            const maxLabels = contentHeight / 24;

            let step = 1;
            let prefix:string = unit;
            if (unit == "bs") {
                let cnt = 0;
                const s = ["B", "kB", "MB", "GB", "TB", "EB"]
                while (maxValue / step > maxLabels) {
                    if (maxValue / step  / 2 <= maxLabels) {step *= 2; break;}
                    if (maxValue / step  / 5 <= maxLabels) {step *= 5; break;}
                    if (maxValue / step  / 10 <= maxLabels) {step *= 10; break;}
                    if (maxValue / step  / 20 <= maxLabels) {step *= 20; break;}
                    if (maxValue / step  / 50 <= maxLabels) {step *= 50; break;}
                    if (maxValue / step  / 100 <= maxLabels) {step *= 100; break;}
                    if (maxValue / step  / 200 <= maxLabels) {step *= 200; break;}
                    if (maxValue / step  / 500 <= maxLabels) {step *= 500; break;}
                    ++cnt;
                    maxValue /= 1024;
                }
                prefix = s[cnt];
            } else {
                while (maxValue / step > maxLabels) {
                    if (maxValue / step  / 2 <= maxLabels) {step *= 2; break;}
                    if (maxValue / step  / 5 <= maxLabels) {step *= 5; break;}
                    step *= 10;
                }
            }
                
            let v = step;
            while (v <= maxValue) {
                labels.push({text: v + prefix + time, value: v});
                v += step;
            }

            let maxWidth = 0;
            for (const {text, value} of labels)
                maxWidth = Math.max(ctx.measureText(text).width);
            
            let lineY = 0;
            let textY = 0;
            if (right) {
                rightSpace = maxWidth + 4;
                lineY = w - maxWidth - 3;
                textY = lineY + 3;
                ctx.textAlign="left"; 
            } else {
                leftSpace = maxWidth+4;
                lineY = maxWidth+3;
                textY = lineY - 3;
                ctx.textAlign="right"; 
            }
            
            ctx.strokeStyle = "white;"
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lineY, topSpace);
            ctx.lineTo(lineY, h-bottomSpace+2);
            ctx.stroke();
            for (const {text, value} of labels) {
                const y = Math.round(topSpace + contentHeight - value * contentHeight / maxValue);
                if (y < 15) continue;
                ctx.beginPath();
                ctx.moveTo(lineY - 2, y);
                ctx.lineTo(lineY + 2, y);
                ctx.stroke();
                ctx.fillText(text, textY, y);
            }

            ctx.restore();
        }

        const cpu = getPoints(["common.cpu", "common.count"], (a, b) => {return b == 0?null: a/b});
        const disk = getPoints(["common.diskread", "common.diskwrite", "common.count"], (a, b, c) => {return c == 0?null: (a+b)/c/5});
        const net = getPoints(["common.netread", "common.netwrite", "common.count"], (a, b, c) => {return c == 0?null: (a+b)/c/5});
        cpu.maxValue = Math.max(cpu.maxValue, 1.0)*1.05;
        const iomax = Math.max(disk.maxValue, net.maxValue)*1.05;
        renderAxisY(cpu.maxValue, "%", false);
        renderAxisY(iomax, "bs", true);

        startTime = this.endTime - (this.canvas.clientWidth - leftSpace - rightSpace) * scale;

        renderXAxes();        
        renderPoints(cpu.points, cpu.maxValue, "red");
        renderPoints(disk.points, iomax, "green");
        renderPoints(net.points, iomax, "blue");

        this.leftSpace = leftSpace;
        this.rightSpace = rightSpace;
    }

    updateCanvasDelayed() {
        if (this.delayedRender) return;
        this.delayedRender = window.setTimeout(()=>{
            this.delayedRender = null;
            this.updateCanvas();
            return true;
        }, 25);
    }

    addBucket(a:IStatBucket) {
        if (!(a.name in this.buckets)) this.buckets[a.name] = {};
        if (!(a.level in this.buckets[a.name])) this.buckets[a.name][a.level] = {};
        this.buckets[a.name][a.level][a.index] = a.values;
        this.updateCanvasDelayed();
    }

    mouseWheel(e:React.WheelEvent<HTMLCanvasElement>) {
        // We want to zoom around the cursor position, so we compute the time at the cursor position

        const scale = Math.pow(2, 20-this.zoom) / preScale;

        let left = 0;
        let el:HTMLElement = this.canvas;
        while (el) {
            left += el.offsetLeft;
            el = el.offsetParent as HTMLElement;
        }

        const dist = left + this.canvas.clientWidth - this.rightSpace - e.pageX;
        const zoomTime = this.endTime - dist*scale;
        this.zoom *= Math.pow(2, -e.deltaY/1500);
        const scale2 = Math.pow(2, 20-this.zoom) / preScale;
        this.endTime = zoomTime + dist*scale2;
        const now = (+new Date() / 1000);
        let snap = false;
        if (this.endTime > now) {
            this.endTime = now;
            snap = true;
        }
        this.setSnap(snap);
        this.requestData();
        this.updateCanvasDelayed();
        e.preventDefault();
        e.stopPropagation(); 
    }  

    mouseDown(e:React.MouseEvent<HTMLCanvasElement>) {
        let startX = e.clientX;
        let oend = this.endTime;
        let snap = false;
        if (this.snapInterval) window.clearInterval(this.snapInterval);
        this.snapInterval = null;

        const mouseMove = (e:MouseEvent) => {
            let et = oend + (startX - e.clientX) * preScale * Math.pow(2, 20 - this.zoom);
            let now = (+new Date() / 1000);
            if (et > now) {
                snap = true;
                et = now;
            } else {
                snap = false;
            }
            this.endTime = et;
            this.requestData();
            this.updateCanvasDelayed();
            e.preventDefault();
            e.stopPropagation();
        };

        const mouseUp = (e:MouseEvent) => {
            mouseMove(e);
            this.setSnap(snap);
            window.removeEventListener("mousemove", mouseMove, true);
            window.removeEventListener("mouseup", mouseUp, true);
        }

        window.addEventListener("mousemove", mouseMove, true);
        window.addEventListener("mouseup", mouseUp, true);
        e.preventDefault();
        e.stopPropagation();
    }

    valueChanges(a:IStatValueChanges) {
        console.log("VALUE CHANGED", a);
        let l = a.level;
        let i = a.index;
        if (!(a.name in this.buckets)) return;
        while (l >= 0) {
            if (!(l in this.buckets[a.name])) this.buckets[a.name][l] = {};
            const ia = i >> 10;
            const ib = i & 1023;
            if (!this.buckets[a.name][l][ia]) {
                this.buckets[a.name][l][ia] = [];
                for (let j=0; j < 1024; ++j) this.buckets[a.name][l][ia].push(0);
            }
            this.buckets[a.name][l][ia][ib] += a.value;
            l -= 1;
            i = i >> 1;
        }
        this.updateCanvasDelayed();
    }

    render() {
        return <canvas style={this.props.style} ref={(c)=>{this.canvas = c;}} onMouseDown={(e)=>this.mouseDown(e)} onWheel={(e)=>this.mouseWheel(e)} />
    }
};

export function handleAction(a:IStatBucket|IStatValueChanges) {
    switch (a.type) {
    case ACTION.StatBucket:
        if (a.target in charts)
            charts[a.target].addBucket(a);
        break;      
    case ACTION.StatValueChanges:
        if (a.target in charts)
            charts[a.target].valueChanges(a);
        break;

    }
};

const Chart = withTheme()(ChartImpl);
export default Chart;
