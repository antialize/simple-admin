use std::hash::Hash;
use std::ops::Deref;

/// Wrap a T reference such that comparisons, and
/// hash are based on the address instead of the
/// content
#[derive(Clone, Copy, Debug)]
pub struct CmpRef<T: Sized>(pub T);

impl<T: Deref> Hash for CmpRef<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::ptr::hash(self.0.deref(), state);
    }
}
impl<T: Deref> Eq for CmpRef<T> {}
impl<T: Deref> PartialEq for CmpRef<T> {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self.0.deref(), other.0.deref())
    }
}
impl<T> Deref for CmpRef<T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
