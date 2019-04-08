import * as React from 'react';

class MyDate {
    constructor(public year: number, public month: number = 0, public date: number = 1, public hours: number = 0, public minutes: number = 0, public seconds: number=0) {
        this.fixup();
    }

    setYear(year:number) {
        this.year = year;
        this.fixup();
    }

    setMonth(month:number) {
        this.month = month;
        this.fixup();
    }

    setDate(date:number) {
        this.date = date;
        this.fixup();
    }

    setHours(hours:number) {
        this.hours = hours;
        this.fixup();
    }

    setMinutes(minutes:number) {
        this.minutes = minutes;
        this.fixup();
    }

    setSeconds(seconds:number) {
        this.seconds = seconds;
        this.fixup();
    }

    monthDayes() {
        switch (this.month) {
        case 0: return 31;
        case 1: return (this.year % 4 == 0 && (this.year % 100 != 0 || this.year % 400 == 0))?29:28;
        case 2: return 31;
        case 3: return 30;
        case 4: return 31;
        case 5: return 30;
        case 6: return 31;
        case 7: return 31;
        case 8: return 30;
        case 9: return 31;
        case 10: return 30;
        case 11: return 31;
        default: return 30;
        }
    }

    fixupMonth() {
        if (this.month >= 0 && this.month <= 11) return;
        this.year += Math.floor(this.month / 12);
        this.month = (this.month % 12 + 12) % 12; 
    }

    fixupDate() {
        while (this.date < 1) {
            this.month -= 1;
            this.fixupMonth();
            this.date += this.monthDayes();
        }
        while (this.date > this.monthDayes()) {
            this.date -= this.monthDayes();
            this.month += 1;            
            this.fixupMonth();            
        }
    }

    fixup() {
        if (this.seconds < 0 || this.seconds >= 60) {
            this.minutes += Math.floor(this.seconds / 60);
            this.seconds = (this.seconds % 60 + 60) % 60;
        }
        if (this.minutes < 0 || this.minutes >= 60) {
            this.hours += Math.floor(this.minutes / 60);
            this.minutes = (this.minutes % 60 + 60) % 60;
        }
        if (this.hours < 0 || this.hours >= 24) {
            this.date += Math.floor(this.hours / 24);
            this.hours = (this.hours % 24 + 24) % 24;
        }
        this.fixupMonth();
        this.fixupDate();
    }

    toDate() {
        return new Date(this.year, this.month, this.date, this.hours, this.minutes, this.seconds);
    }

    toUnix() {
        return (+this.toDate())/1000;
    }
    
    static fromDate(d:Date) {
        return new MyDate(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    }

    static fromUnix(d: number) {
        return MyDate.fromDate(new Date(d*1000));
    }

    toISOString() {
        return this.toDate().toISOString();
    }   

    comp(other:MyDate) {
        if (this.year != other.year) return (this.year < other.year)?-1:1;
        if (this.month != other.month) return (this.month < other.month)?-1:1;
        if (this.date != other.date) return (this.date < other.date)?-1:1;
        if (this.hours != other.hours) return (this.hours < other.hours)?-1:1;
        if (this.minutes != other.minutes) return (this.minutes < other.minutes)?-1:1;
        if (this.seconds != other.seconds) return (this.seconds < other.seconds)?-1:1;
        return 0;        
    }
}

export default MyDate;
