export function DisplayError({ children }: { children: string }) {
    return <span style={{ background: "red" }}>{children}</span>;
}

export default DisplayError;
