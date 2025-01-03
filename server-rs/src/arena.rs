//! Typed Arena allocator

use crate::ocell::{OCell, OCellAccess};
struct Inner<T> {
    current: Vec<T>,
    other: Vec<Vec<T>>,
}

impl<T> Inner<T> {
    fn new_cur(&mut self, c: usize) {
        let o = std::mem::take(&mut self.current);
        self.current.reserve(usize::max(
            usize::min(o.len() * 2, 1024 * 1024 * 32 / size_of::<T>()),
            c,
        ));
        self.other.push(o);
    }

    #[inline]
    fn ensure_capacity(&mut self, c: usize) {
        if self.current.len() + c > self.current.capacity() {
            self.new_cur(c);
        }
    }
}

/// Typed arena allocating objects of type T.
/// The access to the allocator is guarded by an [OCell] marked with M.
/// All items allocated by the arena are dropped when the arena is dropped.
pub struct Arena<T, M>(OCell<M, Inner<T>>);

impl<T, M> Arena<T, M> {
    /// Construct a new area with capacatily for allocating capacity items innitialy.
    #[inline]
    pub fn with_capacity(capacity: usize) -> Self {
        Self(OCell::new(Inner {
            current: Vec::with_capacity(capacity),
            other: Vec::new(),
        }))
    }

    /// Allocate v inside the arena
    #[inline]
    #[allow(clippy::mut_from_ref, clippy::needless_lifetimes)]
    pub fn alloc<'a, 'b>(&'a self, access: &'b mut OCellAccess<M>, v: T) -> &'a mut T {
        let inner = access.rw(&self.0);
        inner.ensure_capacity(1);
        let l = inner.current.len();
        inner.current.push(v);
        // SAFETY: We never resize any Vec<T> so, this pointer will live
        // until the arena is dropped, which cannot happen when there is as &self
        unsafe { &mut *inner.current.as_mut_ptr().add(l) }
    }
}

impl<T, M> Default for Arena<T, M> {
    /// Construct an areana with a sane default initial capacity
    #[inline]
    fn default() -> Self {
        Self::with_capacity(usize::max(1, 2048 / size_of::<T>()))
    }
}

impl<T: Clone, M> Arena<T, M> {
    /// Allocate the slice v within the arena
    #[inline]
    #[allow(clippy::mut_from_ref, clippy::needless_lifetimes)]
    pub fn alloc_slice<'a, 'b>(
        &'a self,
        access: &'b mut OCellAccess<M>,
        v: &'b [T],
    ) -> &'a mut [T] {
        let inner = access.rw(&self.0);
        let count = v.len();
        inner.ensure_capacity(count);
        let l = inner.current.len();
        inner.current.extend_from_slice(v);
        // SAFETY: We never resize any Vec<T> so, this pointer will live
        // until the arena is dropped, which cannot happen when there is as &self
        unsafe { std::slice::from_raw_parts_mut(inner.current.as_mut_ptr().add(l), count) }
    }

    /// Allocate a slice where v is repeated count times within the arena
    #[inline]
    #[allow(clippy::mut_from_ref, clippy::needless_lifetimes)]
    pub fn alloc_slice_repeated<'a, 'b>(
        &'a self,
        access: &'b mut OCellAccess<M>,
        v: T,
        count: usize,
    ) -> &'a mut [T] {
        let inner = access.rw(&self.0);
        inner.ensure_capacity(count);
        let l = inner.current.len();
        for _ in 0..count {
            inner.current.push(v.clone());
        }
        // SAFETY: We never resize any Vec<T> so, this pointer will live
        // until the arena is dropped, which cannot happen when there is as &self
        unsafe { std::slice::from_raw_parts_mut(inner.current.as_mut_ptr().add(l), count) }
    }
}

impl<M> Arena<u8, M> {
    /// Allocate the string v within the arena
    #[inline]
    #[allow(clippy::mut_from_ref)]
    pub fn alloc_str<'a, 'b>(&'a self, access: &'b mut OCellAccess<M>, v: &'b str) -> &'a str {
        let s = self.alloc_slice(access, v.as_bytes());
        // SAFETY: The bytes just came from a str::as_bytes()
        unsafe { std::str::from_utf8_unchecked(s) }
    }
}
