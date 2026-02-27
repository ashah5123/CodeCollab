"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Signal message types (native WebRTC signaling) ──────────────────────────

type SignalMsg =
  | { type: "announce"; from: string }
  | { type: "offer";   from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer";  from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice";     from: string; to: string; candidate: RTCIceCandidateInit | null }
  | { type: "leave";   from: string };

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type Props = { roomId: string; userEmail: string };

export function VoiceVideoCall({ roomId, userEmail }: Props) {
  const [inCall, setInCall]           = useState(false);
  const [audioMuted, setAudioMuted]   = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [peerEmails, setPeerEmails]   = useState<string[]>([]);

  const localStreamRef   = useRef<MediaStream | null>(null);
  const pcsRef           = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef  = useRef<Map<string, MediaStream>>(new Map());
  const remoteVideoRefs  = useRef<Map<string, HTMLVideoElement>>(new Map());
  const localVideoRef    = useRef<HTMLVideoElement | null>(null);
  const channelRef       = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inCallRef        = useRef(false);

  // ─── Broadcast helper ──────────────────────────────────────────────────────

  const broadcast = useCallback((msg: SignalMsg) => {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: msg });
  }, []);

  // ─── Tear down one peer connection ────────────────────────────────────────

  const closePeer = useCallback((email: string) => {
    const pc = pcsRef.current.get(email);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcsRef.current.delete(email);
    }
    remoteStreamsRef.current.delete(email);
    remoteVideoRefs.current.delete(email);
    setPeerEmails((prev) => prev.filter((e) => e !== email));
  }, []);

  // ─── Create RTCPeerConnection for a given peer ────────────────────────────

  const createPeerConnection = useCallback(
    (peerEmail: string): RTCPeerConnection => {
      // Reuse existing connection if already created
      if (pcsRef.current.has(peerEmail)) return pcsRef.current.get(peerEmail)!;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local tracks so the peer can receive our audio/video
      localStreamRef.current?.getTracks().forEach((t) => {
        pc.addTrack(t, localStreamRef.current!);
      });

      // Trickle ICE: send candidates as they arrive
      pc.onicecandidate = (e) => {
        broadcast({
          type: "ice",
          from: userEmail,
          to: peerEmail,
          candidate: e.candidate?.toJSON() ?? null,
        });
      };

      // Receive remote tracks
      const remoteStream = new MediaStream();
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
        remoteStreamsRef.current.set(peerEmail, remoteStream);
        // Attach to video element if it has already rendered
        const el = remoteVideoRefs.current.get(peerEmail);
        if (el) el.srcObject = remoteStream;
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "closed" || state === "disconnected") {
          closePeer(peerEmail);
        }
      };

      pcsRef.current.set(peerEmail, pc);
      setPeerEmails((prev) => (prev.includes(peerEmail) ? prev : [...prev, peerEmail]));
      return pc;
    },
    [userEmail, broadcast, closePeer]
  );

  // ─── Signal handler ───────────────────────────────────────────────────────

  const handleSignal = useCallback(
    async (msg: SignalMsg) => {
      if (msg.from === userEmail) return;
      if (!inCallRef.current) return;

      if (msg.type === "announce") {
        // New peer announced — we are an existing participant, send them an offer
        const pc = createPeerConnection(msg.from);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        broadcast({ type: "offer", from: userEmail, to: msg.from, sdp: offer });

      } else if (msg.type === "offer" && msg.to === userEmail) {
        // We received an offer — create a peer connection and reply with answer
        const pc = createPeerConnection(msg.from);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        broadcast({ type: "answer", from: userEmail, to: msg.from, sdp: answer });

      } else if (msg.type === "answer" && msg.to === userEmail) {
        const pc = pcsRef.current.get(msg.from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

      } else if (msg.type === "ice" && msg.to === userEmail) {
        const pc = pcsRef.current.get(msg.from);
        if (pc && msg.candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
        }

      } else if (msg.type === "leave") {
        closePeer(msg.from);
      }
    },
    [userEmail, createPeerConnection, broadcast, closePeer]
  );

  // ─── Supabase Realtime signaling channel ─────────────────────────────────

  useEffect(() => {
    const ch = supabase.channel(`webrtc:${roomId}`);
    channelRef.current = ch;
    ch.on("broadcast", { event: "signal" }, ({ payload }) => {
      handleSignal(payload as SignalMsg).catch(() => {});
    }).subscribe();
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [roomId, handleSignal]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      for (const pc of pcsRef.current.values()) {
        try { pc.close(); } catch {}
      }
      pcsRef.current.clear();
    };
  }, []);

  // ─── Call actions ─────────────────────────────────────────────────────────

  const joinCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      inCallRef.current = true;
      setInCall(true);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      // Announce presence to all existing call participants
      broadcast({ type: "announce", from: userEmail });
    } catch {
      // Microphone access denied or not available — silently skip
    }
  };

  const leaveCall = useCallback(() => {
    broadcast({ type: "leave", from: userEmail });
    for (const email of [...pcsRef.current.keys()]) closePeer(email);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    inCallRef.current = false;
    setInCall(false);
    setPeerEmails([]);
    setAudioMuted(false);
    setVideoEnabled(false);
  }, [broadcast, closePeer, userEmail]);

  const toggleAudio = () => {
    if (!localStreamRef.current) return;
    const next = !audioMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setAudioMuted(next);
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    if (!videoEnabled) {
      try {
        const vs = await navigator.mediaDevices.getUserMedia({ video: true });
        const vt = vs.getVideoTracks()[0];
        localStreamRef.current.addTrack(vt);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        // Renegotiate with all existing peers to send video
        for (const pc of pcsRef.current.values()) {
          pc.addTrack(vt, localStreamRef.current);
        }
        setVideoEnabled(true);
      } catch {}
    } else {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setVideoEnabled(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!inCall) {
    return (
      <button
        type="button"
        onClick={joinCall}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted/50 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-surface-muted"
        title="Join voice/video call"
      >
        📞 Call
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-2xl p-3 w-64">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white">Live Call</span>
        <span className="text-[10px] text-green-400 animate-pulse">● Live</span>
      </div>

      {/* Local video */}
      <div className="relative rounded-lg overflow-hidden bg-zinc-900 aspect-video">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 rounded">
          You
        </span>
      </div>

      {/* Remote peer video tiles */}
      {peerEmails.map((email) => (
        <div key={email} className="relative rounded-lg overflow-hidden bg-zinc-900 aspect-video">
          <video
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            ref={(el) => {
              if (!el) return;
              remoteVideoRefs.current.set(email, el);
              const stream = remoteStreamsRef.current.get(email);
              if (stream) el.srcObject = stream;
            }}
          />
          <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 rounded">
            {email.split("@")[0]}
          </span>
        </div>
      ))}

      {peerEmails.length === 0 && (
        <p className="text-[10px] text-zinc-500 text-center py-1">
          Waiting for others to join…
        </p>
      )}

      {/* Controls */}
      <div className="flex gap-1.5 mt-1">
        <button
          onClick={toggleAudio}
          className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium border transition-colors ${
            audioMuted
              ? "border-red-500/40 bg-red-500/20 text-red-400"
              : "border-border bg-surface-muted/50 text-zinc-300 hover:bg-surface-muted"
          }`}
        >
          {audioMuted ? "🔇 Muted" : "🎤 Mute"}
        </button>
        <button
          onClick={toggleVideo}
          className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium border transition-colors ${
            videoEnabled
              ? "border-blue-500/40 bg-blue-500/20 text-blue-400"
              : "border-border bg-surface-muted/50 text-zinc-300 hover:bg-surface-muted"
          }`}
        >
          {videoEnabled ? "📹 On" : "📷 Video"}
        </button>
        <button
          onClick={leaveCall}
          className="flex-1 rounded-lg py-1.5 text-[10px] font-medium border border-red-500/40 bg-red-500/20 text-red-400 hover:bg-red-500/30"
        >
          End
        </button>
      </div>
    </div>
  );
}
