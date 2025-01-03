use std::hash::Hash;
use std::ops::Deref;

/// Wrap a T reference such that comparisons, and
/// hash are based on the address instead of the
/// content
pub struct CmpRef<'a, T: Sized>(pub &'a T);

#[allow(clippy::non_canonical_clone_impl)]
impl<T: Sized> Clone for CmpRef<'_, T> {
    fn clone(&self) -> Self {
        Self(self.0)
    }
}
impl<T: Sized> Copy for CmpRef<'_, T> {}

impl<T> Hash for CmpRef<'_, T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::ptr::hash(self.0, state);
    }
}
impl<T> Eq for CmpRef<'_, T> {}
impl<T> PartialEq for CmpRef<'_, T> {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self.0, other.0)
    }
}
impl<T> Deref for CmpRef<'_, T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        self.0
    }
}
