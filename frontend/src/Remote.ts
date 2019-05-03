export interface RemoteData<T> {
    state: 'data',
    data: T;
} 

export interface RemoteError<E> {
    state: 'error',
    data: E;
}

export interface RemoteInitial {
    state: 'initial'
}

export interface RemoteLoading {
    state: 'loading'
}

export type Remote<T, E={}> = RemoteData<T> | RemoteError<E> | RemoteInitial | RemoteLoading;
export default Remote;