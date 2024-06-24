import { type IContains, type IDepends, type ISudoOn } from "./type";

export function getReferences(content: any): number[] {
    const res = [];
    if (content && "contains" in content) {
        for (const o of (content as IContains).contains) {
            res.push(o);
        }
    }

    if (content && "depends" in content) {
        for (const o of (content as IDepends).depends) {
            res.push(o);
        }
    }

    if (content && "sudoOn" in content) {
        for (const o of (content as ISudoOn).sudoOn) {
            res.push(o);
        }
    }

    return res;
}
