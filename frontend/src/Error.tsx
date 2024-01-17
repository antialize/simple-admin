export function Error({children}: {children: string}) {
    return <span style={{background: "red"}}>{children}</span>;
}

export default Error;
