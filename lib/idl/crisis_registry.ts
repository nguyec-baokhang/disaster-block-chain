// Type of lib/idl/crisis_registry.json, camelCased the way `anchor build` emits target/types.
// Regenerate whenever the JSON changes.
export type CrisisRegistry = {
  "address": "82xaA9hPGxDtdT98EZGTjyjyt1HQaM81nm5MFCzF94hz",
  "metadata": {
    "name": "crisisRegistry",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "CrisisSignal on-chain alert registry"
  },
  "instructions": [
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "publishAlert",
      "discriminator": [
        159,
        211,
        118,
        110,
        43,
        83,
        44,
        95
      ],
      "accounts": [
        {
          "name": "agency",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "alert",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  108,
                  101,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "contentHash"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "contentHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "alertId",
          "type": "string"
        }
      ]
    },
    {
      "name": "registerAgency",
      "discriminator": [
        102,
        193,
        24,
        185,
        91,
        84,
        85,
        245
      ],
      "accounts": [
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "agency",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority"
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "retractAlert",
      "discriminator": [
        27,
        217,
        66,
        232,
        46,
        129,
        16,
        79
      ],
      "accounts": [
        {
          "name": "alert",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  108,
                  101,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "alert.contentHash",
                "account": "alert"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "alert"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "supersedeAlert",
      "discriminator": [
        129,
        209,
        217,
        104,
        21,
        21,
        233,
        158
      ],
      "accounts": [
        {
          "name": "alert",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  108,
                  101,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "alert.contentHash",
                "account": "alert"
              }
            ]
          }
        },
        {
          "name": "newAlert",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  108,
                  101,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "newAlert.contentHash",
                "account": "alert"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "alert",
            "newAlert"
          ]
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "agency",
      "discriminator": [
        190,
        253,
        179,
        184,
        231,
        128,
        71,
        112
      ]
    },
    {
      "name": "alert",
      "discriminator": [
        222,
        249,
        201,
        72,
        250,
        104,
        125,
        1
      ]
    },
    {
      "name": "registry",
      "discriminator": [
        47,
        174,
        110,
        246,
        184,
        182,
        252,
        218
      ]
    }
  ],
  "events": [
    {
      "name": "agencyRegistered",
      "discriminator": [
        5,
        236,
        30,
        187,
        211,
        118,
        185,
        67
      ]
    },
    {
      "name": "alertPublished",
      "discriminator": [
        237,
        65,
        18,
        232,
        215,
        201,
        113,
        186
      ]
    },
    {
      "name": "alertRetracted",
      "discriminator": [
        30,
        128,
        192,
        134,
        249,
        230,
        32,
        224
      ]
    },
    {
      "name": "alertSuperseded",
      "discriminator": [
        224,
        2,
        118,
        86,
        95,
        174,
        59,
        132
      ]
    },
    {
      "name": "registryInitialized",
      "discriminator": [
        144,
        138,
        62,
        105,
        58,
        38,
        100,
        177
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not authorized for this action"
    },
    {
      "code": 6001,
      "name": "nameEmpty",
      "msg": "Agency name must not be empty"
    },
    {
      "code": 6002,
      "name": "nameTooLong",
      "msg": "Agency name exceeds 64 bytes"
    },
    {
      "code": 6003,
      "name": "alertIdEmpty",
      "msg": "Alert ID must not be empty"
    },
    {
      "code": 6004,
      "name": "alertIdTooLong",
      "msg": "Alert ID exceeds 16 bytes"
    },
    {
      "code": 6005,
      "name": "agencyInactive",
      "msg": "Agency is not active"
    },
    {
      "code": 6006,
      "name": "alertNotActive",
      "msg": "Alert is not active"
    },
    {
      "code": 6007,
      "name": "newAlertNotActive",
      "msg": "Replacement alert is not active"
    },
    {
      "code": 6008,
      "name": "agencyMismatch",
      "msg": "Replacement alert belongs to a different agency"
    },
    {
      "code": 6009,
      "name": "cannotSupersedeWithSelf",
      "msg": "An alert cannot supersede itself"
    }
  ],
  "types": [
    {
      "name": "agency",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "agencyRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agency",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "alert",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "contentHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "alertId",
            "type": "string"
          },
          {
            "name": "issuedAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "alertStatus"
              }
            }
          },
          {
            "name": "supersededBy",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "alertPublished",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "alert",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "contentHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "alertId",
            "type": "string"
          },
          {
            "name": "issuedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "alertRetracted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "alert",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "retractedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "alertStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "retracted"
          },
          {
            "name": "superseded"
          }
        ]
      }
    },
    {
      "name": "alertSuperseded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "alert",
            "type": "pubkey"
          },
          {
            "name": "newAlert",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "supersededAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "registry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "registryInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
