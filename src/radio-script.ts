// Original fictional exercise dialogue. Audio is generated locally at build-preparation time.
export const radioScript = {
  "phase": {
    "exterior": {
      "id": "crew_ready",
      "speaker": "RAVEN 6 · RADIO",
      "text": "Raven two, this is Raven six. Radio check. Stand by to move.",
      "voice": "am_michael",
      "file": "/audio/crew_ready.mp3"
    },
    "cabin": {
      "id": "moving",
      "speaker": "DRIVER · INTERCOM",
      "text": "Driver ready. Systems are up. Ready when you are.",
      "voice": "am_eric",
      "file": "/audio/moving.mp3"
    },
    "feed": {
      "id": "feed",
      "speaker": "COMMANDER · INTERCOM",
      "text": "I'm watching the charging trend. Keep the engine state and load alongside it.",
      "voice": "am_michael",
      "file": "/audio/feed.mp3"
    },
    "manifold": {
      "id": "manifold",
      "speaker": "CREW · INTERCOM",
      "text": "Vehicle data is coming through. Timestamps and signal quality are with it.",
      "voice": "am_eric",
      "file": "/audio/manifold.mp3"
    },
    "turbine": {
      "id": "turbine",
      "speaker": "COMMANDER · INTERCOM",
      "text": "We have a clean signal history now. Let's see what's changing.",
      "voice": "am_michael",
      "file": "/audio/turbine.mp3"
    },
    "insight": {
      "id": "insight",
      "speaker": "COMMANDER · INTERCOM",
      "text": "Check that charging trend against the load. If it stays high, we'll halt and investigate.",
      "voice": "am_michael",
      "file": "/audio/insight.mp3"
    },
    "halted": {
      "id": "halted",
      "speaker": "DRIVER · INTERCOM",
      "text": "We're stopped. Holding here. Ready to secure the vehicle.",
      "voice": "am_eric",
      "file": "/audio/halted.mp3"
    },
    "secured": {
      "id": "secured",
      "speaker": "COMMANDER · INTERCOM",
      "text": "Vehicle secured. Engine off. Raven six, we're holding for maintenance.",
      "voice": "am_michael",
      "file": "/audio/secured.mp3"
    },
    "service": {
      "id": "service",
      "speaker": "MAINTENANCE · RADIO",
      "text": "Copy. Vehicle stays shut down. We'll handle the suspected source under the service procedure.",
      "voice": "af_heart",
      "file": "/audio/service.mp3"
    },
    "debrief": {
      "id": "debrief",
      "speaker": "RAVEN 6 · RADIO",
      "text": "Copy, Raven two. Hold for repair and verification. We'll work your recovery.",
      "voice": "am_michael",
      "file": "/audio/debrief.mp3"
    }
  },
  "ambient": [
    {
      "id": "net_interval",
      "speaker": "RAVEN 6 · RADIO",
      "text": "All Raven elements, maintain your interval. Keep the route clear.",
      "voice": "am_michael",
      "file": "/audio/net_interval.mp3"
    },
    {
      "id": "net_check",
      "speaker": "RAVEN 3 · RADIO",
      "text": "Raven six, Raven three. Route ahead is clear. Continuing movement.",
      "voice": "af_heart",
      "file": "/audio/net_check.mp3"
    },
    {
      "id": "net_copy",
      "speaker": "RAVEN 6 · RADIO",
      "text": "Copy, Raven three. Keep me advised. Out.",
      "voice": "am_michael",
      "file": "/audio/net_copy.mp3"
    },
    {
      "id": "net_rear",
      "speaker": "RAVEN 4 · RADIO",
      "text": "Raven four. Rear element is together. No change to report.",
      "voice": "am_eric",
      "file": "/audio/net_rear.mp3"
    }
  ]
} as const;
