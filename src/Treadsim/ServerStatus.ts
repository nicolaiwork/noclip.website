export const DATA_SERVER = "http://127.0.0.1:8081";

/** Shows a red banner if the data server isn't reachable, instead of a silent black canvas. */
export async function showServerStatus(): Promise<boolean> {
    try {
        const r = await fetch(`${DATA_SERVER}/health`);
        if (r.ok) return true;
    } catch (_) { /* fall through */ }
    const b = document.createElement("div");
    b.id = "treadsim-server-status";
    b.style.cssText = "position:fixed;top:0;left:0;right:0;padding:12px 18px;background:#b91c1c;color:#fff;font:15px system-ui;z-index:10000;text-align:center";
    b.textContent = `Treadsim data server not reachable at ${DATA_SERVER}. Start it with: pnpm run server`;
    document.body.appendChild(b);
    return false;
}
