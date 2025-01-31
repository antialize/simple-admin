use std::cmp::Ordering;

fn to(l: &serde_json::Value) -> u8 {
    match l {
        serde_json::Value::Null => 0,
        serde_json::Value::Bool(_) => 1,
        serde_json::Value::Number(_) => 2,
        serde_json::Value::String(_) => 3,
        serde_json::Value::Array(_) => 4,
        serde_json::Value::Object(_) => 5,
    }
}

/// Provide a total ordering for serde_json values
pub trait JsonCmp {
    /// Compare to serde_json compatible values based on an unspecifed total ordering
    fn json_cmp(&self, r: &Self) -> Ordering;
}

impl JsonCmp for serde_json::Value {
    fn json_cmp(&self, r: &Self) -> Ordering {
        match (self, r) {
            (serde_json::Value::Bool(l), serde_json::Value::Bool(r)) => l.cmp(r),
            (serde_json::Value::Number(l), serde_json::Value::Number(r)) => l.json_cmp(r),
            (serde_json::Value::String(l), serde_json::Value::String(r)) => l.cmp(r),
            (serde_json::Value::Array(l), serde_json::Value::Array(r)) => l.json_cmp(r),
            (serde_json::Value::Object(l), serde_json::Value::Object(r)) => l.json_cmp(r),
            (l, r) => to(l).cmp(&to(r)),
        }
    }
}

enum NumEnum {
    F64(f64),
    U64(u64),
    I64(i64),
}

fn no(n: &NumEnum) -> u8 {
    match n {
        NumEnum::F64(_) => 0,
        NumEnum::U64(_) => 1,
        NumEnum::I64(_) => 2,
    }
}

impl From<&serde_json::Number> for NumEnum {
    fn from(value: &serde_json::Number) -> Self {
        if value.is_i64() {
            NumEnum::I64(value.as_i64().unwrap())
        } else if value.is_u64() {
            NumEnum::U64(value.as_u64().unwrap())
        } else {
            NumEnum::F64(value.as_f64().unwrap())
        }
    }
}

impl JsonCmp for serde_json::Number {
    fn json_cmp(&self, r: &Self) -> Ordering {
        let l: NumEnum = self.into();
        let r: NumEnum = r.into();
        match (&l, &r) {
            (NumEnum::F64(l), NumEnum::F64(r)) => l
                .partial_cmp(r)
                .unwrap_or_else(|| l.is_nan().cmp(&r.is_nan())),
            (NumEnum::U64(l), NumEnum::U64(r)) => l.cmp(r),
            (NumEnum::I64(l), NumEnum::I64(r)) => l.cmp(r),
            (l, r) => no(l).cmp(&no(r)),
        }
    }
}

impl JsonCmp for serde_json::Map<String, serde_json::Value> {
    fn json_cmp(&self, r: &Self) -> Ordering {
        for ((ln, lv), (rn, rv)) in self.iter().zip(r.iter()) {
            let o = ln.cmp(rn);
            if o.is_ne() {
                return o;
            }
            let o = lv.json_cmp(rv);
            if o.is_ne() {
                return o;
            }
        }
        self.len().cmp(&r.len())
    }
}

impl<T: JsonCmp> JsonCmp for Vec<T> {
    fn json_cmp(&self, r: &Self) -> Ordering {
        for (l, r) in self.iter().zip(r.iter()) {
            let o = l.json_cmp(r);
            if o.is_ne() {
                return o;
            }
        }
        self.len().cmp(&r.len())
    }
}
