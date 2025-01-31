use passfd::FdPassingExt;
use std::{
    io::ErrorKind,
    os::unix::prelude::{AsFd, AsRawFd, BorrowedFd, FromRawFd, OwnedFd},
};

pub trait MyAsFd {
    fn my_as_fd(&self) -> BorrowedFd<'_>;
}

impl MyAsFd for tokio::net::UnixStream {
    fn my_as_fd(&self) -> BorrowedFd<'_> {
        unsafe { BorrowedFd::borrow_raw(self.as_raw_fd()) }
    }
}

impl MyAsFd for tokio::net::UnixListener {
    fn my_as_fd(&self) -> BorrowedFd<'_> {
        unsafe { BorrowedFd::borrow_raw(self.as_raw_fd()) }
    }
}

impl MyAsFd for tokio::net::UnixDatagram {
    fn my_as_fd(&self) -> BorrowedFd<'_> {
        unsafe { BorrowedFd::borrow_raw(self.as_raw_fd()) }
    }
}

impl<T: AsFd> MyAsFd for &T {
    fn my_as_fd(&self) -> BorrowedFd<'_> {
        T::as_fd(self)
    }
}

/// Send a filedescriptor over the write half of a tokio unix stream
pub async fn send_fd(
    stream: &mut tokio::net::unix::OwnedWriteHalf,
    fd: impl MyAsFd,
) -> Result<(), std::io::Error> {
    loop {
        stream.writable().await?;
        match stream.as_ref().try_io(tokio::io::Interest::WRITABLE, || {
            stream
                .as_ref()
                .as_raw_fd()
                .send_fd(fd.my_as_fd().as_raw_fd())
        }) {
            Err(ref e) if e.kind() == ErrorKind::WouldBlock => {
                continue;
            }
            r => return r,
        }
    }
}

/// Recv a filedescriptor from the read half of a tokio unix stream
pub async fn recv_fd(
    stream: &mut tokio::net::unix::OwnedReadHalf,
) -> Result<OwnedFd, std::io::Error> {
    loop {
        stream.readable().await?;
        match stream.as_ref().try_io(tokio::io::Interest::READABLE, || {
            stream.as_ref().as_raw_fd().recv_fd()
        }) {
            Err(ref e) if e.kind() == ErrorKind::WouldBlock => {}
            Ok(v) => return Ok(unsafe { OwnedFd::from_raw_fd(v) }),
            Err(e) => return Err(e),
        }
    }
}
