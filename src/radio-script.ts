// Original fictional exercise dialogue; not an operational radio recording or procedure.
// Call-sign numbers are spelled digit by digit for local speech synthesis. Keep cue IDs stable.
export const radioScript = {
  "phase": {
    "exterior": {
      "id": "crew_ready",
      "speaker": "TOMAHAWK 3 / BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over. Tomahawk three, this is Brave six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "am_michael",
          "spokenText": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over.",
          "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over."
        },
        {
          "speaker": "BRAVE 6",
          "voice": "am_fenrir",
          "spokenText": "Tomahawk three, this is Brave six. Wilco. Out.",
          "text": "Tomahawk three, this is Brave six. Wilco. Out."
        }
      ],
      "file": "/audio/crew_ready.mp3?v=serious-radio-r51"
    },
    "cabin": {
      "id": "moving",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Crew checks complete. Driver, move when ready.",
      "voice": "am_fenrir",
      "file": "/audio/moving.mp3?v=serious-radio-r51"
    },
    "feed": {
      "id": "feed",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Bring up the charging trend. Keep engine state and electrical load beside it.",
      "voice": "am_fenrir",
      "file": "/audio/feed.mp3?v=serious-radio-r51"
    },
    "manifold": {
      "id": "manifold",
      "speaker": "DRIVER · INTERCOM",
      "channel": "intercom",
      "text": "Data's coming through. Timestamps and signal quality are included.",
      "voice": "am_eric",
      "file": "/audio/manifold.mp3?v=serious-radio-r51"
    },
    "turbine": {
      "id": "turbine",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "The signals are lined up now. Check the trend against the load.",
      "voice": "am_fenrir",
      "file": "/audio/turbine.mp3?v=serious-radio-r51"
    },
    "insight": {
      "id": "insight",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "That charging trend needs a look. If it stays abnormal, we'll halt. The alternator is only suspected.",
      "voice": "am_fenrir",
      "file": "/audio/insight.mp3?v=serious-radio-r51"
    },
    "halted": {
      "id": "halted",
      "speaker": "DRIVER · INTERCOM",
      "channel": "intercom",
      "text": "Vehicle stopped. Holding here. Ready to secure.",
      "voice": "am_eric",
      "file": "/audio/halted.mp3?v=serious-radio-r51"
    },
    "secured": {
      "id": "secured",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Vehicle secured. Engine off. Keep it shut down for maintenance.",
      "voice": "am_fenrir",
      "file": "/audio/secured.mp3?v=serious-radio-r51"
    },
    "service": {
      "id": "service",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Keep it shut down. The alternator is still suspected. Maintenance must confirm the fault before repair.",
      "voice": "am_fenrir",
      "file": "/audio/service.mp3?v=serious-radio-r51"
    },
    "debrief": {
      "id": "debrief",
      "speaker": "COMMANDER · INTERCOM",
      "channel": "intercom",
      "text": "Hold for maintenance. Repair and verification are still required.",
      "voice": "am_fenrir",
      "file": "/audio/debrief.mp3?v=serious-radio-r51"
    }
  },
  "ambient": [
    {
      "id": "net_interval",
      "speaker": "BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "All Brave stations, this is Brave six. Keep transmissions brief. Report changes as they occur. Out.",
      "voice": "am_fenrir",
      "file": "/audio/net_interval.mp3?v=serious-radio-r51"
    },
    {
      "id": "net_check",
      "speaker": "BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "All Brave stations, this is Brave six. Watch your vehicle health. Report faults early. Out.",
      "voice": "am_fenrir",
      "file": "/audio/net_check.mp3?v=serious-radio-r51"
    },
    {
      "id": "net_copy",
      "speaker": "BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "All Brave stations, this is Brave six. Send your status when you reach the dismount point. Out.",
      "voice": "am_fenrir",
      "file": "/audio/net_copy.mp3?v=serious-radio-r51"
    },
    {
      "id": "net_rear",
      "speaker": "BRAVE 12 · RADIO",
      "channel": "radio",
      "text": "Brave six, this is Brave one two. No change to report. Out.",
      "voice": "am_eric",
      "file": "/audio/net_rear.mp3?v=serious-radio-r51"
    }
  ],
  "radioOrders": [
    {
      "id": "order_aztec",
      "company": "aztec",
      "speaker": "TOMAHAWK 3 / AZTEC 6 · RADIO",
      "channel": "radio",
      "text": "Aztec six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over. Tomahawk three, this is Aztec six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "am_michael",
          "text": "Aztec six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over.",
          "spokenText": "Aztec six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over."
        },
        {
          "speaker": "AZTEC 6",
          "voice": "am_fenrir",
          "text": "Tomahawk three, this is Aztec six. Wilco. Out.",
          "spokenText": "Tomahawk three, this is Aztec six. Wilco. Out."
        }
      ],
      "file": "/audio/order_aztec.mp3?v=serious-radio-r51"
    },
    {
      "id": "order_brave",
      "company": "brave",
      "speaker": "TOMAHAWK 3 / BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over. Tomahawk three, this is Brave six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "am_michael",
          "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over.",
          "spokenText": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over."
        },
        {
          "speaker": "BRAVE 6",
          "voice": "am_fenrir",
          "text": "Tomahawk three, this is Brave six. Wilco. Out.",
          "spokenText": "Tomahawk three, this is Brave six. Wilco. Out."
        }
      ],
      "file": "/audio/order_brave.mp3?v=serious-radio-r51"
    },
    {
      "id": "order_crazy_horse",
      "company": "crazy-horse",
      "speaker": "TOMAHAWK 3 / CRAZY HORSE 6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over. Tomahawk three, this is Crazy Horse six. Wilco. Out.",
      "voice": "am_michael",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "am_michael",
          "text": "Crazy Horse six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over.",
          "spokenText": "Crazy Horse six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over."
        },
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_fenrir",
          "text": "Tomahawk three, this is Crazy Horse six. Wilco. Out.",
          "spokenText": "Tomahawk three, this is Crazy Horse six. Wilco. Out."
        }
      ],
      "file": "/audio/order_crazy_horse.mp3?v=serious-radio-r51"
    }
  ],
  "radioRelays": [
    {
      "id": "relay_aztec_1_6",
      "company": "aztec",
      "platoon": 1,
      "speaker": "AZTEC 6 / AZTEC 1-6 · RADIO",
      "channel": "radio",
      "text": "Aztec one-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Aztec six, this is Aztec one-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "am_fenrir",
          "text": "Aztec one-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Aztec one six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "AZTEC 1-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec one-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_1_6.mp3?v=serious-radio-r51"
    },
    {
      "id": "relay_aztec_2_6",
      "company": "aztec",
      "platoon": 2,
      "speaker": "AZTEC 6 / AZTEC 2-6 · RADIO",
      "channel": "radio",
      "text": "Aztec two-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Aztec six, this is Aztec two-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "am_fenrir",
          "text": "Aztec two-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Aztec two six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "AZTEC 2-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec two-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_2_6.mp3?v=serious-radio-r51"
    },
    {
      "id": "relay_aztec_3_6",
      "company": "aztec",
      "platoon": 3,
      "speaker": "AZTEC 6 / AZTEC 3-6 · RADIO",
      "channel": "radio",
      "text": "Aztec three-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Aztec six, this is Aztec three-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "am_fenrir",
          "text": "Aztec three-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Aztec three six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "AZTEC 3-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec three-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec three six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_3_6.mp3?v=serious-radio-r51"
    },
    {
      "id": "relay_brave_1_6",
      "company": "brave",
      "platoon": 1,
      "speaker": "BRAVE 6 / BRAVE 1-6 · RADIO",
      "channel": "radio",
      "text": "Brave one-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Brave six, this is Brave one-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "am_fenrir",
          "text": "Brave one-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Brave one six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "BRAVE 1-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave one-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_1_6.mp3?v=serious-radio-r51"
    },
    {
      "id": "relay_brave_2_6",
      "company": "brave",
      "platoon": 2,
      "speaker": "BRAVE 6 / BRAVE 2-6 · RADIO",
      "channel": "radio",
      "text": "Brave two-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Brave six, this is Brave two-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "am_fenrir",
          "text": "Brave two-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Brave two six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "BRAVE 2-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave two-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_2_6.mp3?v=serious-radio-r51"
    },
    {
      "id": "relay_brave_3_6",
      "company": "brave",
      "platoon": 3,
      "speaker": "BRAVE 6 / BRAVE 3-6 · RADIO",
      "channel": "radio",
      "text": "Brave three-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Brave six, this is Brave three-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "am_fenrir",
          "text": "Brave three-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Brave three six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "BRAVE 3-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave three-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave three six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_3_6.mp3?v=serious-radio-r51"
    },
    {
      "id": "relay_crazy_horse_1_6",
      "company": "crazy-horse",
      "platoon": 1,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 1-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse one-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Crazy Horse six, this is Crazy Horse one-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_fenrir",
          "text": "Crazy Horse one-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Crazy Horse one six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "CRAZY HORSE 1-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse one-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_1_6.mp3?v=serious-radio-r51"
    },
    {
      "id": "relay_crazy_horse_2_6",
      "company": "crazy-horse",
      "platoon": 2,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 2-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse two-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Crazy Horse six, this is Crazy Horse two-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_fenrir",
          "text": "Crazy Horse two-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Crazy Horse two six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "CRAZY HORSE 2-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse two-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_2_6.mp3?v=serious-radio-r51"
    },
    {
      "id": "relay_crazy_horse_3_6",
      "company": "crazy-horse",
      "platoon": 3,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 3-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse three-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Crazy Horse six, this is Crazy Horse three-six. Wilco. Out.",
      "voice": "am_fenrir",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_fenrir",
          "text": "Crazy Horse three-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Crazy Horse three six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "CRAZY HORSE 3-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse three-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse three six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_3_6.mp3?v=serious-radio-r51"
    }
  ],
  "radioFemale": [
    {
      "id": "order_aztec_female",
      "company": "aztec",
      "speaker": "TOMAHAWK 3 / AZTEC 6 · RADIO",
      "channel": "radio",
      "text": "Aztec six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over. Tomahawk three, this is Aztec six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "af_sarah",
          "text": "Aztec six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over.",
          "spokenText": "Aztec six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over."
        },
        {
          "speaker": "AZTEC 6",
          "voice": "am_fenrir",
          "text": "Tomahawk three, this is Aztec six. Wilco. Out.",
          "spokenText": "Tomahawk three, this is Aztec six. Wilco. Out."
        }
      ],
      "file": "/audio/order_aztec_female.mp3?v=serious-radio-r51",
      "baseId": "order_aztec"
    },
    {
      "id": "order_brave_female",
      "company": "brave",
      "speaker": "TOMAHAWK 3 / BRAVE 6 · RADIO",
      "channel": "radio",
      "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over. Tomahawk three, this is Brave six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "af_sarah",
          "text": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over.",
          "spokenText": "Brave six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over."
        },
        {
          "speaker": "BRAVE 6",
          "voice": "am_fenrir",
          "text": "Tomahawk three, this is Brave six. Wilco. Out.",
          "spokenText": "Tomahawk three, this is Brave six. Wilco. Out."
        }
      ],
      "file": "/audio/order_brave_female.mp3?v=serious-radio-r51",
      "baseId": "order_brave"
    },
    {
      "id": "order_crazy_horse_female",
      "company": "crazy-horse",
      "speaker": "TOMAHAWK 3 / CRAZY HORSE 6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over. Tomahawk three, this is Crazy Horse six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "TOMAHAWK 3",
          "voice": "af_sarah",
          "text": "Crazy Horse six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over.",
          "spokenText": "Crazy Horse six, this is Tomahawk three. Move to the marked dismount point. Deliver the squad. Report completion. Over."
        },
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "am_fenrir",
          "text": "Tomahawk three, this is Crazy Horse six. Wilco. Out.",
          "spokenText": "Tomahawk three, this is Crazy Horse six. Wilco. Out."
        }
      ],
      "file": "/audio/order_crazy_horse_female.mp3?v=serious-radio-r51",
      "baseId": "order_crazy_horse"
    },
    {
      "id": "relay_aztec_1_6_female",
      "company": "aztec",
      "platoon": 1,
      "speaker": "AZTEC 6 / AZTEC 1-6 · RADIO",
      "channel": "radio",
      "text": "Aztec one-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Aztec six, this is Aztec one-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "af_sarah",
          "text": "Aztec one-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Aztec one six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "AZTEC 1-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec one-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_1_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_aztec_1_6"
    },
    {
      "id": "relay_aztec_2_6_female",
      "company": "aztec",
      "platoon": 2,
      "speaker": "AZTEC 6 / AZTEC 2-6 · RADIO",
      "channel": "radio",
      "text": "Aztec two-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Aztec six, this is Aztec two-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "af_sarah",
          "text": "Aztec two-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Aztec two six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "AZTEC 2-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec two-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_2_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_aztec_2_6"
    },
    {
      "id": "relay_aztec_3_6_female",
      "company": "aztec",
      "platoon": 3,
      "speaker": "AZTEC 6 / AZTEC 3-6 · RADIO",
      "channel": "radio",
      "text": "Aztec three-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Aztec six, this is Aztec three-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "AZTEC 6",
          "voice": "af_sarah",
          "text": "Aztec three-six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Aztec three six, this is Aztec six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "AZTEC 3-6",
          "voice": "am_eric",
          "text": "Aztec six, this is Aztec three-six. Wilco. Out.",
          "spokenText": "Aztec six, this is Aztec three six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_aztec_3_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_aztec_3_6"
    },
    {
      "id": "relay_brave_1_6_female",
      "company": "brave",
      "platoon": 1,
      "speaker": "BRAVE 6 / BRAVE 1-6 · RADIO",
      "channel": "radio",
      "text": "Brave one-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Brave six, this is Brave one-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "af_sarah",
          "text": "Brave one-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Brave one six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "BRAVE 1-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave one-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_1_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_brave_1_6"
    },
    {
      "id": "relay_brave_2_6_female",
      "company": "brave",
      "platoon": 2,
      "speaker": "BRAVE 6 / BRAVE 2-6 · RADIO",
      "channel": "radio",
      "text": "Brave two-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Brave six, this is Brave two-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "af_sarah",
          "text": "Brave two-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Brave two six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "BRAVE 2-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave two-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_2_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_brave_2_6"
    },
    {
      "id": "relay_brave_3_6_female",
      "company": "brave",
      "platoon": 3,
      "speaker": "BRAVE 6 / BRAVE 3-6 · RADIO",
      "channel": "radio",
      "text": "Brave three-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Brave six, this is Brave three-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "BRAVE 6",
          "voice": "af_sarah",
          "text": "Brave three-six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Brave three six, this is Brave six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "BRAVE 3-6",
          "voice": "am_eric",
          "text": "Brave six, this is Brave three-six. Wilco. Out.",
          "spokenText": "Brave six, this is Brave three six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_brave_3_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_brave_3_6"
    },
    {
      "id": "relay_crazy_horse_1_6_female",
      "company": "crazy-horse",
      "platoon": 1,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 1-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse one-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Crazy Horse six, this is Crazy Horse one-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "af_sarah",
          "text": "Crazy Horse one-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Crazy Horse one six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "CRAZY HORSE 1-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse one-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse one six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_1_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_crazy_horse_1_6"
    },
    {
      "id": "relay_crazy_horse_2_6_female",
      "company": "crazy-horse",
      "platoon": 2,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 2-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse two-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Crazy Horse six, this is Crazy Horse two-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "af_sarah",
          "text": "Crazy Horse two-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Crazy Horse two six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "CRAZY HORSE 2-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse two-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse two six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_2_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_crazy_horse_2_6"
    },
    {
      "id": "relay_crazy_horse_3_6_female",
      "company": "crazy-horse",
      "platoon": 3,
      "speaker": "CRAZY HORSE 6 / CRAZY HORSE 3-6 · RADIO",
      "channel": "radio",
      "text": "Crazy Horse three-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over. Crazy Horse six, this is Crazy Horse three-six. Wilco. Out.",
      "voice": "af_sarah",
      "segments": [
        {
          "speaker": "CRAZY HORSE 6",
          "voice": "af_sarah",
          "text": "Crazy Horse three-six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the LD to reach the dismount point. Over.",
          "spokenText": "Crazy Horse three six, this is Crazy Horse six. Cleared to test fire. Then move to the line of departure. Report when ready. You have three minutes from the ell dee to reach the dismount point. Over."
        },
        {
          "speaker": "CRAZY HORSE 3-6",
          "voice": "am_eric",
          "text": "Crazy Horse six, this is Crazy Horse three-six. Wilco. Out.",
          "spokenText": "Crazy Horse six, this is Crazy Horse three six. Wilco. Out."
        }
      ],
      "file": "/audio/relay_crazy_horse_3_6_female.mp3?v=serious-radio-r51",
      "baseId": "relay_crazy_horse_3_6"
    }
  ]
} as const;
