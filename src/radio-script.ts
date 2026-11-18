// Original fictional exercise dialogue; not an operational radio recording or procedure.
// Call-sign numbers are spelled digit by digit for local speech synthesis. Keep cue IDs stable.
export const radioScript = {
  "phase": {
    "exterior": {
      "id": "crew_ready",
      "speaker": "TOMAHAWK 3 / BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad and report completion. Over. Tomahawk three, this is Brave six. Wilco. Out.",
      "voice": "am_eric",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "am_eric",
          "spokenText": "Brave six, this is Tomahawk tree. Move to the marked dismount point. Deliver the squad and report completion. Over.",
          "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad and report completion. Over."
        },
        {
          "speaker": "BRAVE 6",
          "voice": "af_heart",
          "spokenText": "Tomahawk tree, this is Brave six. Wilco. Out.",
          "text": "Tomahawk three, this is Brave six. Wilco. Out."
        }
      ],
      "file": "/audio/crew_ready.mp3?v=brave11-r42b"
    },
    "cabin": {
      "id": "moving",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Crew checks complete. Driver, move when ready.",
      "voice": "am_michael",
      "file": "/audio/moving.mp3?v=net-orders-r42b"
    },
    "feed": {
      "id": "feed",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Bring up the charging trend. Keep engine state and electrical load beside it.",
      "voice": "am_michael",
      "file": "/audio/feed.mp3?v=brave11-r42"
    },
    "manifold": {
      "id": "manifold",
      "speaker": "DRIVER · INTERCOM",
      "channel": "intercom",
      "text": "Data's coming through. Timestamps and signal quality are included.",
      "voice": "am_eric",
      "file": "/audio/manifold.mp3?v=brave11-r42"
    },
    "turbine": {
      "id": "turbine",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "The signals are lined up now. Check the trend against the load.",
      "voice": "am_michael",
      "file": "/audio/turbine.mp3?v=brave11-r42"
    },
    "insight": {
      "id": "insight",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "That charging trend needs a look. If it stays abnormal, we'll halt. The alternator is only suspected.",
      "voice": "am_michael",
      "file": "/audio/insight.mp3?v=brave11-r42"
    },
    "halted": {
      "id": "halted",
      "speaker": "DRIVER · INTERCOM",
      "channel": "intercom",
      "text": "Vehicle stopped. Holding here. Ready to secure.",
      "voice": "am_eric",
      "file": "/audio/halted.mp3?v=brave11-r42"
    },
    "secured": {
      "id": "secured",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Vehicle secured. Engine off. Keep it shut down for maintenance.",
      "voice": "am_michael",
      "file": "/audio/secured.mp3?v=brave11-r42"
    },
    "service": {
      "id": "service",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Keep it shut down. The alternator is still suspected. Maintenance must confirm the fault before repair.",
      "voice": "am_michael",
      "file": "/audio/service.mp3?v=brave11-r42"
    },
    "debrief": {
      "id": "debrief",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Hold for maintenance. Repair and verification are still required.",
      "voice": "am_michael",
      "file": "/audio/debrief.mp3?v=net-orders-r42b"
    }
  },
  "ambient": [
    {
      "id": "net_interval",
      "speaker": "BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "All Brave stations, this is Brave six. Keep transmissions brief. Report changes as they occur. Out.",
      "voice": "af_heart",
      "file": "/audio/net_interval.mp3?v=brave11-r42"
    },
    {
      "id": "net_check",
      "speaker": "BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "All Brave stations, this is Brave six. Watch your vehicle health. Report faults early. Out.",
      "voice": "af_heart",
      "file": "/audio/net_check.mp3?v=net-orders-r42b"
    },
    {
      "id": "net_copy",
      "speaker": "BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "All Brave stations, this is Brave six. Send your status when you reach the dismount point. Out.",
      "voice": "af_heart",
      "file": "/audio/net_copy.mp3?v=net-orders-r42b"
    },
    {
      "id": "net_rear",
      "speaker": "BRAVE 12 · RADIO",
      "channel": "radio",
      "text": "Brave six, this is Brave one two. No change to report. Out.",
      "voice": "am_eric",
      "file": "/audio/net_rear.mp3?v=brave11-r42"
    }
  ],
  "radioOrders": [
    {
      "id": "order_aztec",
      "company": "aztec",
      "speaker": "TOMAHAWK 3 / AZTEC 6 · RADIO",
      "channel": "radio",
      "text": "Aztec six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad and report completion. Over. Tomahawk three, this is Aztec six. Wilco. Out.",
      "voice": "am_eric",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "am_eric",
          "text": "Aztec six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad and report completion. Over.",
          "spokenText": "Aztec six, this is Tomahawk tree. Move to the marked dismount point. Deliver the squad and report completion. Over."
        },
        {
          "speaker": "AZTEC 6",
          "voice": "am_michael",
          "text": "Tomahawk three, this is Aztec six. Wilco. Out.",
          "spokenText": "Tomahawk tree, this is Aztec six. Wilco. Out."
        }
      ],
      "file": "/audio/order_aztec.mp3?v=net-orders-r42b"
    },
    {
      "id": "order_brave",
      "company": "brave",
      "speaker": "TOMAHAWK 3 / BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad and report completion. Over. Tomahawk three, this is Brave six. Wilco. Out.",
      "voice": "am_eric",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "am_eric",
          "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad and report completion. Over.",
          "spokenText": "Brave six, this is Tomahawk tree. Move to the marked dismount point. Deliver the squad and report completion. Over."
        },
        {
          "speaker": "BRAVE 6",
          "voice": "af_heart",
          "text": "Tomahawk three, this is Brave six. Wilco. Out.",
          "spokenText": "Tomahawk tree, this is Brave six. Wilco. Out."
        }
      ],
      "file": "/audio/order_brave.mp3?v=net-orders-r42b"
    },
    {
      "id": "order_crazy_horse",
      "company": "crazy-horse",
      "speaker": "TOMAHAWK 3 / CRAZY HORSE 6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad and report completion. Over. Tomahawk three, this is Crazy Horse six. Wilco. Out.",
      "voice": "am_eric",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad and report completion. Over.",
          "spokenText": "Crazy Horse six, this is Tomahawk tree. Move to the marked dismount point. Deliver the squad and report completion. Over."
        },
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_michael",
          "text": "Tomahawk three, this is Crazy Horse six. Wilco. Out.",
          "spokenText": "Tomahawk tree, this is Crazy Horse six. Wilco. Out."
        }
      ],
      "file": "/audio/order_crazy_horse.mp3?v=net-orders-r42b"
    }
  ],
  "radioRelays": [
    {
      "id": "relay_aztec_1_6",
      "company": "aztec",
      "platoon": 1,
      "speaker": "AZTEC 6 / AZTEC 1-6 · RADIO",
      "channel": "radio",
      "text": "Aztec one-six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over. Aztec six, this is Aztec one-six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "am_michael",
          "text": "Aztec one-six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Aztec one six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "AZTEC 1-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec one-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_1_6.mp3?v=net-orders-r42b"
    },
    {
      "id": "relay_aztec_2_6",
      "company": "aztec",
      "platoon": 2,
      "speaker": "AZTEC 6 / AZTEC 2-6 · RADIO",
      "channel": "radio",
      "text": "Aztec two-six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over. Aztec six, this is Aztec two-six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "am_michael",
          "text": "Aztec two-six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Aztec two six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "AZTEC 2-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec two-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_2_6.mp3?v=net-orders-r42b"
    },
    {
      "id": "relay_aztec_3_6",
      "company": "aztec",
      "platoon": 3,
      "speaker": "AZTEC 6 / AZTEC 3-6 · RADIO",
      "channel": "radio",
      "text": "Aztec three-six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over. Aztec six, this is Aztec three-six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "am_michael",
          "text": "Aztec three-six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Aztec tree six, this is Aztec six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "AZTEC 3-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec three-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec tree six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_3_6.mp3?v=net-orders-r42b"
    },
    {
      "id": "relay_brave_1_6",
      "company": "brave",
      "platoon": 1,
      "speaker": "BRAVE 6 / BRAVE 1-6 · RADIO",
      "channel": "radio",
      "text": "Brave one-six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over. Brave six, this is Brave one-six. Wilco. Out.",
      "voice": "af_heart",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "af_heart",
          "text": "Brave one-six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Brave one six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "BRAVE 1-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave one-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_1_6.mp3?v=net-orders-r42b"
    },
    {
      "id": "relay_brave_2_6",
      "company": "brave",
      "platoon": 2,
      "speaker": "BRAVE 6 / BRAVE 2-6 · RADIO",
      "channel": "radio",
      "text": "Brave two-six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over. Brave six, this is Brave two-six. Wilco. Out.",
      "voice": "af_heart",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "af_heart",
          "text": "Brave two-six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Brave two six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "BRAVE 2-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave two-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_2_6.mp3?v=net-orders-r42b"
    },
    {
      "id": "relay_brave_3_6",
      "company": "brave",
      "platoon": 3,
      "speaker": "BRAVE 6 / BRAVE 3-6 · RADIO",
      "channel": "radio",
      "text": "Brave three-six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over. Brave six, this is Brave three-six. Wilco. Out.",
      "voice": "af_heart",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "af_heart",
          "text": "Brave three-six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Brave tree six, this is Brave six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "BRAVE 3-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave three-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave tree six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_3_6.mp3?v=net-orders-r42b"
    },
    {
      "id": "relay_crazy_horse_1_6",
      "company": "crazy-horse",
      "platoon": 1,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 1-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse one-six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over. Crazy Horse six, this is Crazy Horse one-six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_michael",
          "text": "Crazy Horse one-six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Crazy Horse one six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "CRAZY HORSE 1-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse one-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_1_6.mp3?v=net-orders-r42b"
    },
    {
      "id": "relay_crazy_horse_2_6",
      "company": "crazy-horse",
      "platoon": 2,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 2-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse two-six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over. Crazy Horse six, this is Crazy Horse two-six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_michael",
          "text": "Crazy Horse two-six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Crazy Horse two six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "CRAZY HORSE 2-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse two-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_2_6.mp3?v=net-orders-r42b"
    },
    {
      "id": "relay_crazy_horse_3_6",
      "company": "crazy-horse",
      "platoon": 3,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 3-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse three-six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over. Crazy Horse six, this is Crazy Horse three-six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_michael",
          "text": "Crazy Horse three-six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over.",
          "spokenText": "Crazy Horse tree six, this is Crazy Horse six. Continue to the assigned dismount point. Report when complete. Over."
        },
        {
          "speaker": "CRAZY HORSE 3-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse three-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse tree six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_3_6.mp3?v=net-orders-r42b"
    }
  ]
} as const;
