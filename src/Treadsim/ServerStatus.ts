export const DATA_SERVER = "http://127.0.0.1:8081";

/** True if the data server answers /health. Used by the route picker's status line. */
export async function isServerUp(): Promise<boolean> {
    try { return (await fetch(`${DATA_SERVER}/health`)).ok; } catch { return false; }
}
