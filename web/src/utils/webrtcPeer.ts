/** Stateless helpers on a receiving RTCPeerConnection. */

/** Ask every inbound video receiver for a keyframe (where the browser supports it). */
export async function requestInboundKeyFrame(pc: RTCPeerConnection): Promise<void> {
  for (const receiver of pc.getReceivers()) {
    if (receiver.track?.kind !== "video") continue;
    const requestKeyFrame = (
      receiver as RTCRtpReceiver & { requestKeyFrame?: () => Promise<void> }
    ).requestKeyFrame;
    if (requestKeyFrame) {
      try {
        await requestKeyFrame.call(receiver);
      } catch (err) {
        console.warn("requestKeyFrame failed:", err);
      }
    }
  }
}

/** Bytes and decoded frames received on inbound video, summed over streams. */
export async function getInboundVideoStats(
  pc: RTCPeerConnection
): Promise<{ bytesReceived: number; framesDecoded: number }> {
  let bytesReceived = 0;
  let framesDecoded = 0;
  const stats = await pc.getStats();
  stats.forEach((report) => {
    if (report.type === "inbound-rtp" && report.kind === "video") {
      bytesReceived += Number(report.bytesReceived ?? 0);
      framesDecoded += Number(report.framesDecoded ?? 0);
    }
  });
  return { bytesReceived, framesDecoded };
}
