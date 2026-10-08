"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useClassroomMedia({ role, status, peers, signals, iceServers, send }) {
  const connections = useRef(new Map());
  const signalQueue = useRef(Promise.resolve());
  const lastSignal = useRef(0);
  const streamRef = useRef(null);
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
    if (role === "TEACHER" && streamRef.current) {
      for (const track of streamRef.current.getTracks()) pc.addTrack(track, streamRef.current);
    }
    return entry;
  }, [iceServers, role, send]);

  useEffect(() => {
    const current = connections.current;
    for (const [id, entry] of current) {
      if (status !== "ACTIVE" || !peers.some((target) => target.id === id) || (role === "TEACHER" && !localStream)) {
        entry.pc.close();
        current.delete(id);
      }
    }
    if (status === "ENDED") streamRef.current?.getTracks().forEach((track) => track.stop());
    if (status === "ACTIVE" && role === "TEACHER" && localStream) peers.forEach(peer);
  }, [localStream, peer, peers, role, status]);

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
      current.forEach(({ pc }) => pc.close());
      current.clear();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("الكاميرا تحتاج رابطاً آمناً (HTTPS) أو localhost.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 540 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setLocalStream(stream);
      setError("");
      return stream;
    } catch {
      throw new Error("تعذر فتح الكاميرا والميكروفون. اسمح باستخدامهما ثم أعد المحاولة.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setLocalStream(null);
  }

  function toggleMicrophone() {
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !track.enabled; });
  }

  return { localStream, remoteStreams: remoteStreams.filter((item) => peers.some((target) => target.id === item.id)), startCamera, stopCamera, toggleMicrophone, error };
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
