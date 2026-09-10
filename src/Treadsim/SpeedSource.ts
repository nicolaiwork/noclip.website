export const KMH_TO_MPS = 1000 / 3600;

/** Anything that can report treadmill speed. The slider is one; a watch app is another. */
export interface SpeedSource {
    readonly id: string;
    start(): Promise<void>;
    stop(): void;
    /** Subscribe to speed samples in m/s. Returns an unsubscribe function. */
    onSpeed(cb: (speedMps: number, at: number) => void): () => void;
}
