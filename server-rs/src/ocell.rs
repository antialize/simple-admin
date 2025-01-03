//! Safeish marker cell

use std::{cell::UnsafeCell, marker::PhantomData};

#[allow(unused)]
struct Invariant<T>(fn(T) -> T);

/// A cell storing a value of type T.
/// The cell can be mutably accessed using [OCellAccess::rw].
/// The cell can be shared acessed using [OCellAccess::ro].
#[repr(transparent)]
pub struct OCell<Marker, T> {
    _phantom: PhantomData<Invariant<Marker>>,
    value: UnsafeCell<T>,
}

impl<Marker, T> OCell<Marker, T> {
    /// Construct a new cell storing value
    #[inline]
    pub const fn new(value: T) -> OCell<Marker, T> {
        OCell {
            _phantom: PhantomData,
            value: UnsafeCell::new(value),
        }
    }
}

impl<Marker: 'static, T: Default> Default for OCell<Marker, T> {
    fn default() -> Self {
        OCell::new(T::default())
    }
}

unsafe impl<Marker, T: Send + Sync> Sync for OCell<Marker, T> {}

/// Accessor for [OCell]s for a given Marker.
///
/// This allows seperating the owner ship and access semantics
/// values stored in [OCell]s. Any number of OCells can "belong"
/// to a given [OCellAccess]. But only one of them can be mutated
/// at the same time since that requires a &mut to the acessor.
///
/// This cell/accessor is not strictly safe, it must be constructed
/// as:
/// ```
/// {
///     let mut access = unsafe {
///         struct Marker;
///         OCellAccess::<Marker>::new();
///     };
///     let access = &mut access;
///
///     // Do stuff involing OCell<Maker> here
/// }
/// ```
///
/// The user must ensure that the acessor does not exist past the end
/// of the outer scope. For instance it would be unsafe to [std::mem::swap()]
/// the accessor with another acessor.
///
/// Once should also take care that the [`OCell<Maker>`] does not somehow escape
/// the outer scope so that they could be accessed in a parallel invocation
/// of the same function. This unsafty seems quite hard to pull off since
/// there is no way to name the Maker type outside.
pub struct OCellAccess<Marker> {
    _phantom: PhantomData<Invariant<Marker>>,
}

impl<Marker> OCellAccess<Marker> {
    /// To use this safely do
    /// ```
    /// let mut access = unsafe {
    ///     struct Marker;
    ///     OCellAccess::<Marker>::new();
    /// };
    /// let access = &mut access;
    /// ```
    pub unsafe fn new() -> Self {
        Self {
            _phantom: PhantomData,
        }
    }

    /// Access the [OCell] cell mutible
    pub fn rw<T>(&mut self, cell: &OCell<Marker, T>) -> &mut T {
        unsafe { &mut *cell.value.get() }
    }

    /// Access the [OCell] cell shared
    pub fn ro<T>(&self, cell: &OCell<Marker, T>) -> &T {
        unsafe { &*cell.value.get() }
    }
}
