"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function syncLocalTracks(pc, stream) {
  const tracks = stream?.getTracks() ?? [];
  for (const sender of pc.getSenders()) {
    if (sender.track && !tracks.includes(sender.track)) pc.removeTrack(sender);
  }
  for (const track of tracks) {
    if (!pc.getSenders().some((sender) => sender.track === track)) pc.addTrack(track, stream);
  }
}

export function useClassroomMedia({ role, status, peers, signals, iceServers, send }) {
  const connections = useRef(new Map());
  const signalQueue = useRef(Promise.resolve());
  const lastSignal = useRef(0);
  const streamRef = useRef(null);
  const captureVersion = useRef(0);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [error, setError] = useState("");

  const peer = useCallback((target) => {
    const existing = connections.current.get(target.id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers });
    const entry = { pc, makingOffer: false, ignoreOffer: false, settingAnswer: false, pending: [] };
    connections.current.set(target.id, entry);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send({ action: "signal", toPeer: target.id, payload: { candidate: candidate.toJSON() } }).catch(() => {});
    };
    pc.ontrack = ({ streams, track }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      setRemoteStreams((current) => [...current.filter((item) => item.id !== target.id), { id: target.id, name: target.name, stream }]);
      stream.onremovetrack = () => {
        if (!stream.getTracks().length) {
          setRemoteStreams((current) => current.filter((item) => item.id !== target.id || item.stream !== stream));
        }
      };
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") setError("تعذر اتصال الفيديو. أعد الانضمام أو جرب شبكة أخرى.");
      if (pc.connectionState === "closed") setRemoteStreams((current) => current.filter((item) => item.id !== target.id));
    };
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        await send({ action: "signal", toPeer: target.id, payload: { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } } });
      } catch {
        if (pc.connectionState !== "closed") setError("تعذر بدء اتصال الفيديو. أعد الانضمام.");
      } finally {
        entry.makingOffer = false;
      }
    };
    syncLocalTracks(pc, streamRef.current);
    return entry;
  }, [iceServers, send]);

  useEffect(() => {
    const current = connections.current;
    for (const [id, entry] of current) {
      if (status !== "ACTIVE" || !peers.some((target) => target.id === id)) {
        entry.pc.close();
        current.delete(id);
      } else {
        syncLocalTracks(entry.pc, localStream);
      }
    }
    if (status === "ACTIVE" && localStream) peers.forEach(peer);
  }, [localStream, peer, peers, status]);

  useEffect(() => {
    for (const signal of signals) {
      if (signal.id <= lastSignal.current) continue;
      lastSignal.current = signal.id;
      signalQueue.current = signalQueue.current.then(async () => {
        const target = peers.find((item) => item.id === signal.fromPeer);
        if (!target || status !== "ACTIVE") return;
        const entry = peer(target);
        const { pc } = entry;
        const { description, candidate } = signal.payload;
        if (description) {
          const ready = !entry.makingOffer && (pc.signalingState === "stable" || entry.settingAnswer);
          const collision = description.type === "offer" && !ready;
          entry.ignoreOffer = role === "TEACHER" && collision;
          if (entry.ignoreOffer) return;
          entry.settingAnswer = description.type === "answer";
          await pc.setRemoteDescription(description);
          entry.settingAnswer = false;
          for (const pending of entry.pending.splice(0)) await pc.addIceCandidate(pending);
          if (description.type === "offer") {
            await pc.setLocalDescription();
            await send({ action: "signal", toPeer: target.id, payload: { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } } });
          }
        } else if (candidate && !entry.ignoreOffer) {
          if (pc.remoteDescription) await pc.addIceCandidate(candidate);
          else entry.pending.push(candidate);
        }
      }).catch(() => {
        setError("تعذر اتصال الفيديو. أعد الانضمام للجلسة.");
      });
    }
  }, [peer, peers, role, send, signals, status]);

  useEffect(() => {
    const current = connections.current;
    return () => {
      captureVersion.current += 1;
      current.forEach(({ pc }) => pc.close());
      current.clear();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopCamera = useCallback(() => {
    captureVersion.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    connections.current.forEach(({ pc }) => {
      if (pc.signalingState !== "closed") syncLocalTracks(pc, null);
    });
    setLocalStream(null);
  }, []);

  useEffect(() => {
    // Leaving an active connection also cancels a pending browser permission prompt.
    if (status === "ACTIVE") return stopCamera;
  }, [status, stopCamera]);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("الكاميرا تحتاج رابطاً آمناً (HTTPS) أو localhost.");
    const version = ++captureVersion.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 540 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (version !== captureVersion.current) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setLocalStream(stream);
      setError("");
      return stream;
    } catch {
      throw new Error("تعذر فتح الكاميرا والميكروفون. اسمح باستخدامهما ثم أعد المحاولة.");
    }
  }

  function toggleMicrophone() {
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !track.enabled; });
  }

  function toggleCamera() {
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !track.enabled; });
  }

  return { localStream, remoteStreams: remoteStreams.filter((item) => status === "ACTIVE" && peers.some((target) => target.id === item.id)), startCamera, stopCamera, toggleMicrophone, toggleCamera, error };
}

export function ClassroomStream({ stream, muted = false, videoRef, testId }) {
  const internalRef = useRef(null);
  const reference = videoRef ?? internalRef;
  useEffect(() => {
    if (!reference.current) return;
    reference.current.srcObject = stream;
    if (stream) reference.current.play().catch(() => {});
  }, [reference, stream]);
  return <video ref={reference} data-testid={testId} autoPlay playsInline controls muted={muted} className="aspect-video w-full rounded-xl bg-black" />;
}
