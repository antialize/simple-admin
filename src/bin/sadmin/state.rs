use std::{
    future::Future,
    ops::Deref,
    sync::{Mutex, MutexGuard},
    task::Waker,
};

struct StateContent<T> {
    state: T,
    waiters: Vec<Waker>,
}

/// Store some state T, that can be mutated
/// It is possible to wait for the value to get into a specific state
pub struct State<T> {
    content: std::sync::Mutex<StateContent<T>>,
}
pub struct StateValue<'a, T>(MutexGuard<'a, StateContent<T>>);

impl<T> Deref for StateValue<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.0.state
    }
}

pub struct StateWaiter<'a, T, P: Fn(&T) -> bool> {
    state: &'a State<T>,
    p: P,
}

impl<'a, T, P: Fn(&T) -> bool> Future for StateWaiter<'a, T, P> {
    type Output = StateValue<'a, T>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let mut content = self.state.content.lock().unwrap();
        if (self.p)(&content.state) {
            std::task::Poll::Ready(StateValue(content))
        } else {
            content.waiters.push(cx.waker().clone());
            std::task::Poll::Pending
        }
    }
}

unsafe impl<T, P: Fn(&T) -> bool> Send for StateWaiter<'_, T, P> {}

impl<T: Eq> State<T> {
    pub fn new(v: T) -> Self {
        State {
            content: Mutex::new(StateContent {
                state: v,
                waiters: Vec::new(),
            }),
        }
    }

    /// Update the value to v, notify any waiters where v fulfills the predicate
    pub fn set(&self, v: T) {
        let mut inner = self.content.lock().unwrap();
        if inner.state == v {
            return;
        }
        for w in std::mem::take(&mut inner.waiters) {
            w.wake();
        }
        inner.state = v;
    }

    /// Get the current value, return a wrapper of the mutex lock
    pub fn get(&self) -> StateValue<'_, T> {
        StateValue(self.content.lock().unwrap())
    }

    /// Return future waiting for predicate to full some predicate
    pub fn wait<P: Fn(&T) -> bool>(&self, p: P) -> StateWaiter<'_, T, P> {
        StateWaiter { state: self, p }
    }
}
